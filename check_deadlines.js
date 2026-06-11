const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO SICURO ---");

    // 1. DIAGNOSTICA DEI SECRET
    const requiredEnv = [
      'FIREBASE_SERVICE_ACCOUNT',
      'EMAILJS_SERVICE_ID',
      'EMAILJS_TEMPLATE_ID',
      'EMAILJS_PUBLIC_KEY',
      'EMAILJS_PRIVATE_KEY'
    ];

    console.log("Verifica variabili d'ambiente in corso...");
    for (const env of requiredEnv) {
      const val = process.env[env];
      if (!val || val.trim() === "" || val === "undefined") {
        console.error(`❌ ERRORE CRITICO: Il Secret "${env}" arriva VUOTO allo script.`);
        process.exit(1); 
      } else {
        console.log(`  -> Variabile "${env}" presente (Lunghezza: ${val.trim().length} caratteri).`);
      }
    }

    // Inizializzazione protetta
    const pKey = String(process.env.EMAILJS_PUBLIC_KEY).trim();
    const sKey = String(process.env.EMAILJS_PRIVATE_KEY).trim();
    
    emailjs.init({
      publicKey: pKey,
      privateKey: sKey
    });
    console.log("✅ EmailJS inizializzato globalmente.");

    // 2. Inizializzazione Firebase
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    console.log("✅ Connessione a Firebase riuscita.");

    // 3. Calcolo data limite (oggi + 60 giorni)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 60);
    const targetStr = targetDate.toISOString().split('T')[0];

    console.log(`Ricerca pratiche non notificate con scadenza <=: ${targetStr}`);

    // 4. Query
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '<=', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica da notificare per oggi.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche potenziali. Verifica in corso...`);

    // 5. Ciclo di invio
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`\n--- Elaborazione: ${data.entityName || 'Senza Nome'} ---`);
      
      if (!data.deadline) {
        console.log(`⚠️ Salto: Manca la data di scadenza.`);
        continue;
      }

      const destinatarioEmail = "prevenzioneprince@gmail.com";

      const now = new Date();
      now.setHours(0,0,0,0);
      const prkDate = new Date(data.deadline);
      prkDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((prkDate - now) / (1000 * 60 * 60 * 24));

      const templateParams = {
        to_email: destinatarioEmail,
        admin_name: data.administrator || "Amministratore",
        entity_name: data.entityName || "Soggetto N.D.",
        pi_code: data.pi || "N.D.",
        deadline: data.deadline ? data.deadline.split('-').reverse().join('/') : "N.D.",
        activity: data.activity || "N.D.",
        address: data.address || "N.D.",
        municipality: data.municipality || "N.D.",
        days_left: diffDays.toString()
      };

      try {
        console.log(`Invio a EmailJS per: ${templateParams.to_email}...`);
        
        const response = await emailjs.send(
          String(process.env.EMAILJS_SERVICE_ID).trim(),
          String(process.env.EMAILJS_TEMPLATE_ID).trim(),
          templateParams
        );

        console.log(`✅ Successo! Status: ${response.status}`);

        // 6. Aggiornamento Database
        await db.collection('scadenze_pratiche').doc(docId).update({
          mailSent60: true,
          lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Firebase aggiornato per ${docId}`);

      } catch (mailError) {
        console.error(`❌ Errore EmailJS:`, mailError);
        throw mailError; 
      }
    }

    console.log("\n--- PROCESSO COMPLETATO CON SUCCESSO ---");

  } catch (error) {
    console.error("\n❌ ERRORE CRITICO INTERCETTATO:");
    console.error(error.message || error);
    process.exit(1); 
  }
}

checkAndSendEmails();
