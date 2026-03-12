const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root
 * Aggiornato con log di debug avanzati per risolvere l'errore "undefined".
 */
async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO ---");

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

    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    console.log("✅ Connessione a Firebase riuscita.");

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 60);
    const targetStr = targetDate.toISOString().split('T')[0];

    console.log(`Ricerca pratiche con scadenza: ${targetStr}`);

    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '==', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica trovata da notificare oggi.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche. Inizio invio email...`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      console.log(`Preparazione email per: ${data.entityName || 'Soggetto Ignoto'}`);
      
      const templateParams = {
        to_email: data.adminEmail || "",
        admin_name: data.administrator || "Amministratore",
        entity_name: data.entityName || "Soggetto N.D.",
        pi_code: data.pi || "N.D.",
        deadline: data.deadline ? data.deadline.split('-').reverse().join('/') : "N.D.",
        activity: data.activity || "N.D.",
        address: data.address || "N.D.",
        municipality: data.municipality || "N.D."
      };

      try {
        console.log("Chiamata a EmailJS...");
        const response = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY,
          }
        );
        console.log(`✅ Risposta EmailJS: ${response.status} ${response.text}`);

        await db.collection('scadenze_pratiche').doc(doc.id).update({
          mailSent60: true,
          lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Database aggiornato per: ${data.entityName}`);

      } catch (mailError) {
        console.error(`❌ Errore durante l'invio per ${data.entityName}:`, mailError);
        // Lanciamo l'errore per fermare lo script e vederlo nei log di GitHub
        throw mailError;
      }
    }

    console.log("--- PROCESSO COMPLETATO CON SUCCESSO ---");

  } catch (error) {
    console.error("❌ ERRORE CRITICO NELLO SCRIPT:");
    console.error(error); // Stampiamo l'intero oggetto errore
    process.exit(1); 
  }
}

checkAndSendEmails();
