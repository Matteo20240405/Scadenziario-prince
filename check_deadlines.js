const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root
 * Versione con debug granulare per risolvere il problema dell'errore "undefined".
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

    console.log(`Ricerca pratiche che scadono esattamente il: ${targetStr}`);

    // 4. Query al database
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '==', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica trovata per questa data che richieda l'invio.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche da notificare. Avvio invio individuale...`);

    // 5. Ciclo di invio
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`Processando pratica ID: ${docId} (${data.entityName || 'Senza Nome'})`);
      
      // Controllo dati minimi per EmailJS
      if (!data.adminEmail || data.adminEmail.trim() === "") {
        console.warn(`⚠️ Salto pratica ${docId}: Email amministratore mancante.`);
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
        console.log(`Chiamata a EmailJS per: ${templateParams.to_email}`);
        
        // Eseguiamo l'invio
        const response = await emailjs.send(
          process.env.EMAILJS_SERVICE_ID,
          process.env.EMAILJS_TEMPLATE_ID,
          templateParams,
          {
            publicKey: process.env.EMAILJS_PUBLIC_KEY,
            privateKey: process.env.EMAILJS_PRIVATE_KEY,
          }
        );

        console.log(`✅ Risposta EmailJS per ${docId}: ${response.status} - ${response.text}`);

        // 6. Aggiornamento Database solo se l'invio è riuscito
        await db.collection('scadenze_pratiche').doc(docId).update({
          mailSent60: true,
          lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Database aggiornato: mailSent60 = true per ${docId}`);

      } catch (mailError) {
        // Se l'errore è undefined, cerchiamo di estrarre più info possibili
        console.error(`❌ ERRORE DURANTE L'INVIO PER ${docId}:`);
        
        if (mailError && typeof mailError === 'object') {
          console.error("Dettagli errore:", JSON.stringify(mailError));
          if (mailError.text) console.error("Messaggio Server:", mailError.text);
        } else {
          console.error("L'errore restituito è nullo o non identificato.");
        }
        
        // Non blocchiamo il ciclo per una singola mail fallita, ma segnaliamo l'errore
        throw mailError; 
      }
    }

    console.log("--- PROCESSO TERMINATO ---");

  } catch (error) {
    console.error("❌ ERRORE CRITICO DI SISTEMA:");
    console.error(error);
    process.exit(1); 
  }
}

// Esecuzione
checkAndSendEmails();
