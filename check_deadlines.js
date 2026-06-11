const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

/**
 * SCRIPT DI AUTOMAZIONE - POSIZIONE: Root
 * Recupera tutte le pratiche scadute o in scadenza entro 60 giorni
 * Invia tutte le notifiche a un indirizzo email fisso di controllo.
 */
async function checkAndSendEmails() {
  try {
    console.log("--- AVVIO PROCESSO DI CONTROLLO SICURO ---");

    // 1. DIAGNOSTICA E VERIFICA DEI SECRET DI GITHUB
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

    // Inizializzazione protetta di EmailJS per evitare crash interni della libreria
    const pKey = String(process.env.EMAILJS_PUBLIC_KEY).trim();
    const sKey = String(process.env.EMAILJS_PRIVATE_KEY).trim();
    
    emailjs.init({
      publicKey: pKey,
      privateKey: sKey
    });
    console.log("✅ EmailJS inizializzato globalmente.");

    // 2. INIZIALIZZAZIONE FIREBASE CON PULIZIA STRINGA STRUTTURATA
    let serviceAccount;
    try {
      // Rimuove eventuali spazi vuoti o ritorni a capo spuri all'inizio/fine del Secret di GitHub
      const cleanJsonString = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      serviceAccount = JSON.parse(cleanJsonString);
    } catch (jsonError) {
      console.error("\n❌ ERRORE CRITICO NEL PARSING DEL JSON DI FIREBASE:");
      console.error("Il testo dentro FIREBASE_SERVICE_ACCOUNT non è un JSON valido.");
      console.error("Controlla di averlo copiato e incollato correttamente nei Secret di GitHub.");
      throw jsonError;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    console.log("✅ Connessione a Firebase riuscita.");

    // 3. CALCOLO DATA LIMITE (OGGI + 60 GIORNI)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 60);
    const targetStr = targetDate.toISOString().split('T')[0];

    console.log(`Ricerca pratiche non notificate con scadenza uguale o inferiore a: ${targetStr}`);

    // 4. QUERY SU FIRESTORE
    const snapshot = await db.collection('scadenze_pratiche')
      .where('deadline', '<=', targetStr)
      .where('mailSent60', '==', false)
      .get();

    if (snapshot.empty) {
      console.log("ℹ️ Nessuna pratica da notificare per oggi.");
      return;
    }

    console.log(`Trovate ${snapshot.size} pratiche potenziali. Inizio elaborazione...`);

    // 5. CICLO DI INVIO NOTIFICHE CON EMAIL FISSA
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      console.log(`\n--- Elaborazione: ${data.entityName || 'Senza Nome'} ---`);
      
      if (!data.deadline) {
        console.log(`⚠️ Salto la pratica ${docId}: Manca la data di scadenza (deadline).`);
        continue;
      }

      // Destinatario fisso di controllo
      const destinatarioEmail = "prevenzioneprince@gmail.com";

      // Calcolo dei giorni effettivi rimanenti alla scadenza
      const now = new Date();
      now.setHours(0,0,0,0);
      const prkDate = new Date(data.deadline);
      prkDate.setHours(0,0,0,0);
      const diffDays = Math.ceil((prkDate - now) / (1000 * 60 * 60 * 24));

      // Configurazione dei parametri del template di EmailJS
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
        console.log(`Invio tramite EmailJS a: ${templateParams.to_email} (Giorni rimanenti: ${diffDays})...`);
        
        const response = await emailjs.send(
          String(process.env.EMAILJS_SERVICE_ID).trim(),
          String(process.env.EMAILJS_TEMPLATE_ID).trim(),
          templateParams
        );

        console.log(`✅ Mail inviata con successo! Status
