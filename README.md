Scadenziario Prevenzione Incendi

Applicazione web per la gestione e il monitoraggio delle scadenze delle pratiche di prevenzione incendi.

Funzionalità

Dashboard Statistiche: Visualizzazione immediata di pratiche totali, scadute o imminenti.

Gestione CRUD: Aggiunta, modifica ed eliminazione delle pratiche.

Import/Export CSV: Compatibile con Google Sheets (richiede formato data AAAA-MM-GG).

Persistenza Dati: Utilizza Firebase Firestore per il salvataggio in tempo reale.

Design Responsive: Ottimizzato per desktop e dispositivi mobili grazie a Tailwind CSS.

Requisiti per il Deploy

L'applicazione è pronta per l'uso. Se desideri utilizzare il tuo database Firebase personale:

Crea un progetto su Firebase Console.

Abilita l'autenticazione anonima.

Crea un database Firestore.

Sostituisci la configurazione firebaseConfig all'interno del file index.html.

Come pubblicare su GitHub Pages

Crea un nuovo repository su GitHub.

Carica il file index.html.

Vai nelle Settings del repository.

Seleziona Pages nel menu a sinistra.

Sotto "Build and deployment", imposta la sorgente su "Deploy from a branch" e seleziona main.

Salva e attendi qualche minuto: la tua app sarà online all'indirizzo https://tuo-username.github.io/nome-repo/.

Sviluppato come strumento di supporto tecnico per la gestione della sicurezza antincendio.
