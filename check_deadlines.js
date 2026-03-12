const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root (cartella principale) del repository
 * Questo script viene lanciato da GitHub Actions per controllare le scadenze.
 */
async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO ---");

    // Verifica la presenza dei Secrets configurati su GitHub
    const requiredEnv = [
      'FIREBASE_SERVICE_ACCOUNT',
      'EMAILJS_SERVICE_ID',
      'EMAILJS_TEMPLATE_ID',
      'EMAILJS_PUBLIC_KEY',
      'EMAILJS_PRIVATE_KEY'
    ];

    requiredEnv.forEach(env => {
      if (!process.env[env] || process.env[env].trim() === "") {
        throw new Error(`Il Secret "${env}" è vuoto o mancante su GitHub.`);
      }
    });

    // Inizializzazione Firebase
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();
    console.log("✅ Connessione a Firebase riuscita.");

    // Calcolo della data di oggi + 60 giorni
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() +60);
    const targetStr = targetDate.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    console.log(`Ricerca pratiche che scadono il: ${targetStr}`);

    // Query: Cerca pratiche con scadenza target e email non ancora inviata
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '==', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica trovata per la data selezionata.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche da notificare.`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      const templateParams = {
        to_email: data.adminEmail || "Email non disponibile",
        admin_name: data.administrator || "Amministratore",
        entity_name: data.entityName || "Soggetto N.D.",
        pi_code: data.pi || "N.D.",
        deadline: data.deadline ? data.deadline.split('-').reverse().join('/') : "N.D.",
        activity: data.activity || "N.D.",
        address: data.address || "N.D.",
        municipality: data.municipality || "N.D."
      };

      // Invio email tramite EmailJS
      await emailjs.send(
        process.env.EMAILJS_SERVICE_ID,
        process.env.EMAILJS_TEMPLATE_ID,
        templateParams,
        {
          publicKey: process.env.EMAILJS_PUBLIC_KEY,
          privateKey: process.env.EMAILJS_PRIVATE_KEY,
        }
      );

      // Segna come inviata per evitare duplicati
      await db.collection('scadenze_pratiche').doc(doc.id).update({
        mailSent60: true
      });

      console.log(`✅ Email inviata con successo per: ${data.entityName}`);
    }

    console.log("--- PROCESSO COMPLETATO ---");

  } catch (error) {
    console.error("❌ ERRORE CRITICO:");
    console.error(error.message);
    process.exit(1); 
  }
}

checkAndSendEmails();
