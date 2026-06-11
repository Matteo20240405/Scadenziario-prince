const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root
 * Corretto: Recupera tutte le pratiche scadute o in scadenza entro 60 giorni
 * Invia tutte le notifiche a un indirizzo email fisso di controllo.
 */
async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO SICURO ---");

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

    // Inizializzazione globale di EmailJS con i passaporti di sicurezza
    emailjs.init({
      publicKey: String(process.env.EMAILJS_PUBLIC_KEY).trim(),
      privateKey: String(process.env.EMAILJS_PRIVATE_KEY).trim(),
    });

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

    console.log(`Ricerca pratiche non notificate con scadenza uguale o inferiore a: ${targetStr}`);

    // 4. Query modificata: prende tutto ciò che è minore o uguale (<=) a 60 giorni
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '<=', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica da notificare per oggi.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche potenziali. Verifica in corso...`);

    // 5. Ciclo di invio modificato con Email Fissa
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`\n--- Elaborazione: ${data.entityName || 'Senza Nome'} ---`);
      
      if (!data.deadline) {
        console.log(`⚠️ Salto: Manca la data di scadenza.`);
        continue;
      }

      // MODIFICA: Forziamo l'invio alla tua email specifica invece di cercarla nel database
      const destinatarioEmail = "prevenzioneprince@gmail.com";

      // Calcoliamo i giorni effettivi rimanenti solo per il testo della mail
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
        console.log(`Invio a EmailJS per: ${templateParams.to_email} (Mancano ${diffDays} giorni)...`);
        
        // Chiamata semplificata sfruttando l'inizializzazione globale precedente
        const response = await emailjs.send(
          String(process.env.EMAILJS_SERVICE_ID).trim(),
          String(process.env.EMAILJS_TEMPLATE_ID).trim(),
          templateParams
        );

        console.log(`✅ Successo! Status: ${response.status}`);

        // 6. Aggiornamento Database: blocca futuri invii duplicati
        await db.collection('scadenze_pratiche').doc(docId).update({
          mailSent60: true,
          lastEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Firebase aggiornato per ${docId}`);

      } catch (mailError) {
        console.error(`❌ Errore durante l'invio o la validazione di EmailJS:`, mailError);
        
        if (mailError && mailError.status === 412) {
          console.error("💡 AZIONE RICHIESTA: Il collegamento Gmail è scaduto o non autorizzato. Vai su EmailJS -> Email Services e clicca su RECONNECT.");
        } else if (mailError && mailError.status === 403) {
          console.error("💡 NOTA: Devi abilitare 'API access from non-browser environments' nelle impostazioni di sicurezza di EmailJS.");
        }
        
        throw mailError; 
      }
    }

    console.log("\n--- PROCESSO COMPLETATO CON SUCCESSO ---");

  } catch (error) {
    console.error("\n❌ ERRORE CRITICO:");
    console.error(error.message || error);
    process.exit(1); 
  }
}

checkAndSendEmails();
