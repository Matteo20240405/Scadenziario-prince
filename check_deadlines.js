const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root
 * Risoluzione errore 403: Richiede attivazione "Non-browser environments" su EmailJS.
 */
async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO ---");

    // 1. Verifica la presenza di tutti i Secret necessari
    const requiredEnv = [
      'FIREBASE_SERVICE_ACCOUNT',
      'EMAILJS_SERVICE_ID',
      'EMAILJS_TEMPLATE_ID',
      'EMAILJS_PUBLIC_KEY',
      'EMAILJS_PRIVATE_KEY'
    ];

    for (const env of requiredEnv) {
      if (!process.env[env] || process.env[env].trim() === "") {
        throw new Error(`Configurazione fallita: Il Secret "${env}" è vuoto o mancante su GitHub.`);
      }
    }

    // 2. Inizializzazione Firebase
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    console.log("✅ Connessione a Firebase riuscita.");

    // 3. Calcolo data target (oggi + 60 giorni)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 60);
    const targetStr = targetDate.toISOString().split('T')[0];

    console.log(`Ricerca pratiche che scadono il: ${targetStr}`);

    // 4. Query al database
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '==', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica da notificare per oggi.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche. Inizio invio email...`);

    // 5. Ciclo di invio
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`\n--- Elaborazione: ${data.entityName || 'Senza Nome'} ---`);
      
      if (!data.adminEmail || data.adminEmail.trim() === "") {
        console.warn(`⚠️ Salto: Email amministratore mancante.`);
        continue;
      }

      const templateParams = {
        to_email: data.adminEmail,
        admin_name: data.administrator || "Amministratore",
        entity_name: data.entityName || "Soggetto N.D.",
        pi_code: data.pi || "N.D.",
        deadline: data.deadline ? data.deadline.split('-').reverse().join('/') : "N.D.",
        activity: data.activity || "N.D.",
        address: data.address || "N.D.",
        municipality: data.municipality || "N.D."
      };

      try {
        console.log(`Invio a EmailJS per: ${templateParams.to_email}...`);
        
        const response = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY,
          }
        );

        console.log(`✅ Successo! Status: ${response.status}`);

        // 6. Aggiornamento Database
        await db.collection('scadenze_pratiche').doc(docId).update({
          mailSent60: true,
          lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Firebase aggiornato per ${docId}`);

      } catch (mailError) {
        console.error(`❌ Errore EmailJS: ${mailError.status} - ${mailError.text}`);
        
        if (mailError.status === 403) {
          console.error("💡 NOTA: Devi abilitare 'API access from non-browser environments' nelle impostazioni di sicurezza di EmailJS.");
        }
        
        throw mailError; 
      }
    }

    console.log("\n--- PROCESSO COMPLETATO CON SUCCESSO ---");

  } catch (error) {
    console.error("\n❌ ERRORE CRITICO:");
    console.error(error);
    process.exit(1); 
  }
}

checkAndSendEmails();
