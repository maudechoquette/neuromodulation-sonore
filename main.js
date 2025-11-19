import {ModulateurAudio} from "./audio.js";

//Fonctions de sélection des éléments des documents (pour faciliter le code)
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

//Création du moteur audio pour gérer les fonctions
const moteuraudio = new ModulateurAudio(); 


// Initialisations //

let langactuelle = "fr"; //Variable d'état de la langue (français par défaut)
let enLecture = false; //Variable d'état globale de la lecture audio 
let freq_ac = null; //Stockage de la fréquence des acouphènes de l'utilisateur 

//TMNMT
let tmnmtMode = 'base';
let tmnmt_temps_debut = null;
let tmnmtDureeChoisie = 0;
let tmnmtEnCours = false; 
let tmnmtStop = null;
let tmnmtTimer = null;
let tmnmtEnPause = false;
let tmnmtTempsRestant = 0;
let tmnmt_temps_ecoule = 0;

//MWT
let mwt_temps_debut = null;
let mwtEnCours = false;
let mwtStop = null;
let mwtTimer = null;
let mwtEnPause = false;
let mwtTempsRestant = 0;
let mwt_temps_ecoule = 0;

//ADT
let adtEnCours = false;
let freq_un = 0;
let freq_deux = 0;
let aigu = 0;
let bonnes_reponses = 0;
let mauvaises_reponses = 0;
let manchePrete = false; //indique si une manche du jeu est en cours


// Sélecteurs //

// Sélecteurs pour le pitch-matching
const curseurfreq = $("#freq");
const freqout = $("#freqout");
const typesel = $("#typeton");
const boutontest = $("#choixton");

// Sélecteur pour le choix de thérapie
const boutonstherapie = $$("#choix-therapie .mode-btn");

// Sélecteurs pour la TMNMT
const dureeTMNMT = $("#duree-tmnmt");
const optionsTMNMT = $("#options-tmnmt");
const boutonTMNMT = $("#bouton-tmnmt");
const timerTMNMT = $("#tmnmt_timer");
const boutonPauseTMNMT = $("#pause-tmnmt");
const boutonBase = $("#base");
const boutonPerso = $("#personnalise");
const optionsBase = $("#options-base");
const optionsPerso = $("#options-personnalise");
const fichier = $("#fichier-perso");
const tmnmtRapport = $("#tmnmt-rapport");
const fichierInvalide = document.createElement('span'); //Cas où le fichier n'est pas valide
optionsPerso.appendChild(fichierInvalide); //Ajout de l'élément de fichier invalide

// Sélecteurs pour la MWT
const optionsMWT = $("#options-mwt");
const boutonMWT = $("#bouton-mwt"); 
const timerMWT = $("#mwt_timer");
const boutonPauseMWT = $("#pause-mwt");
const mwtRapport = $("#mwt-rapport");

// Sélecteurs pour la ADT
const boutonADT = $("#jeu");
const panelADT = $("#panel-adt");
const optionsADT = $("#options-adt");
const boutonsonun = $("#son_un");
const boutonsondeux = $("#son_deux");
const boutonchoixun = $("#un");
const boutonchoixdeux = $("#deux");
const feedback = $("#feedback");
const adtRapport = $("#adt-rapport");


/**
*Fonction d'affichage de la fréquence actuelle du curseur.
*@param {Number} val, la valeur de la fréquence sélectionnée sur le curseur.
*/
function freqactuelle(val){
    freqout.textContent = `${val} Hz`;
}

/**
*Fonction qui assure que le système audio est prêt et actif. 
*/
async function assurerAudio(){
    await moteuraudio.init(); // Attente du modulateur audio
    try {if (moteuraudio.std?.state === 'suspended') await moteuraudio.std.resume(); } catch {} //Reprise du contexte audio si il a été suspendu
}


// Test de pitch-matching //

/**
*Fonction qui s'active lorsque le bouton de test de fréquence est cliqué pour jouer le ton correspondant
*à la forme et la fréquence choisie.
*/
boutontest.addEventListener("click", async() => {
    await assurerAudio(); //Attente pour assurer que le système audio est prêt
    
    const f = parseFloat(curseurfreq.value); //Lecture de la valeur du curseur (fréquence en Hz) et conversion en valeur flottante
    const t = typesel.value; //Lecture de la forme d'onde choisie 

    if (!enLecture) { //Si aucun son n'est en lecture
        moteuraudio.jouerPitch(f, t, -36); //Lecture du pitch de la forme d'onde et fréquence sélectionnée, avec un gain de -36 dBFS
        enLecture = true;
        boutontest.textContent = langactuelle === "fr" ? "Arrêter" : "Stop"; //Mise à jour de l'affichage du bouton
    } else { //Si un son est déjà en lecture
        moteuraudio.arretSon(); //Arrêt du son actuellement en cours
        enLecture = false;
        boutontest.textContent = langactuelle === "fr" ? "Tester le ton" : "Test tone";
        freq_ac = parseFloat(curseurfreq.value);
    }
});

/**
*Fonction d'arrêt du pitch-matching si le bouton d'arrêt est cliqué.
*/
function stopPitchMatching(){
    try {moteuraudio.arretSon();} catch {} //Arrêt du son
    enLecture = false;
    if (boutontest) {
        boutontest.textContent = (langactuelle === "fr") ? "Tester le ton" : "Test tone"; //Mise à jour de l'affichage du bouton
    }
}

//Gestion du mouvement du curseur pour ajuster la fréquence 
curseurfreq.addEventListener("input", () => {
    const f = parseFloat(curseurfreq.value); //Lecture de la valeur du curseur et conversion en valeur flottante
    freqactuelle(f); //Mise à jour de la valeur de fréquence affichée
    if (enLecture) moteuraudio.defFreq(f); //Lecture de la fréquence choisie en temps réel
    freq_ac = f;
});


// Neuromodulation //

/**
*Fonction de gestion du choix de la thérapie suivie, qui permet de réinitialiser la lecture des sons et gérer l'affichage sur l'interface utilisateur.
*@param {String} mode, le type de thérapie (TMNMT, MWT ou ADT) sélectionnée.
*/
function choisirTherapie(mode){
    stopPitchMatching(); //Arrêt du test de pitch-matching
    try {arreterMWT(); } catch {} //Arrêt de la MWT si en cours
    try {arreterTMNMT(); } catch {} //Arrêt de la TMNMT si en cours
    try {arreterADT(); } catch {} //Arrêt de la ADT si en cours

    //Boutons actifs sur l'interface
    boutonstherapie.forEach(bouton => bouton.classList.toggle('active', bouton.dataset.mode === mode));

    //Cacher tous les panneaux de thérapies avant de choisir celui qu'on veut 
    document.querySelectorAll('.panel').forEach(section => section.classList.remove('is-open'));

    //Affichage des options selon la thérapie choisie
    if (mode === "TMNMT"){ //Si TMNMT choisie
        optionsTMNMT.classList.add('is-open'); //Afficher les options de TMNMT (dans style.css ca affiche quand l'option is-open est activée)
        modeTMNMT('base'); //On met le mode base par défault (les deux options sont les sons de base ou un fichier importé)
    } else if (mode === "MWT"){//Si MWT choisie
        optionsMWT.classList.add('is-open');
    } else if (mode === "ADT"){ //Si ADT choisie
        panelADT.classList.add('is-open');
        optionsADT.style.display = "none";
    }

    //Réinitialisation des timers et boutons
    if (timerTMNMT) timerTMNMT.textContent = "00:00";
    if (timerMWT) timerMWT.textContent = "00:00";
    if (boutonMWT) boutonMWT.textContent = (langactuelle === "fr") ? "Démarrer la séance" : "Start listening session";
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Démarrer la séance" : "Start listening session";
    }

//Sélection de la thérapie en fonction des boutons (gestionnaire d'évènement)
boutonstherapie.forEach(bouton => {
    bouton.addEventListener('click', () => choisirTherapie(bouton.dataset.mode));
});


// TMNMT //

/**
*Fonction qui gère le choix du mode de TMNMT : sons de base ou fichier audio importé par l'utilisateur. Elle met à jour l'interface. 
*@param {String} modw_tmnmt, le mode choisi (en fonction du bouton cliqué)
*/
function modeTMNMT(mode_tmnmt){
    tmnmtMode = mode_tmnmt; //Mise à jour de la variable globale qui stocke le mode de TMNMT
    boutonBase.classList.toggle('active', mode_tmnmt === 'base'); //Si le bouton de base est choisi on utilise les sons de base
    boutonPerso.classList.toggle('active', mode_tmnmt === 'personnalise'); //Si le bouton de fichier personnalisé est choisi on utilise le fichier fourni
    if (mode_tmnmt === "base"){ //Si le mode de base est sélectionné
        optionsBase.style.display = ""; //Affichage du panneau avec les options du mode de base
        optionsPerso.style.display = 'none'; //Cache du panneau avec les options du mode personnalisé
        fichierInvalide.textContent = ''; //Cache des messages d'erreur
        dureeTMNMT.disabled = false; //On a besoin de la durée de séance si le TMNMT est utilisé en mode "base" (car le signal est continu).
    } else if (mode_tmnmt === "personnalise"){ //Si le mode personnalisé est sélectionné
        optionsBase.style.display = "none"; //Cache du panneau avec les options du mode de base
        optionsPerso.style.display = ''; //Affichage du panneau avec les options du mode personnalisé
        dureeTMNMT.disabled = true; //Si le TMNMT est utilisé en mode personnalisé, on n'a pas besoin de la durée de séance (on utilise la durée du fichier audio).
    } 
}
//Gestionnaire d'évènement pour le choix du mode de TMNMT (en fonction du bouton cliqué)
boutonBase.addEventListener('click', () => modeTMNMT('base'));
boutonPerso.addEventListener('click', () => modeTMNMT('personnalise'));

/**
*Fonction de démarrage du TMNMT avec le mode de base, qui applique la chaine de filtrage sur le signal et gère le timer.
*/
async function demarrerTMNMT(){
    await assurerAudio(); //Attente du contexte audio
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterMWT();} catch {} //Arrêt de la MWT si elle est en cours 
    try {arreterADT();} catch {} //Arrêt de la ADT si elle est en cours

    tmnmtRapport.innerHTML = ''; //Conteneur vide du rapport à télécharger

    const f_ac = freq_ac || parseFloat(curseurfreq.value); //Fréquence des acouphènes
    const typeTherapie = $("#type")?.value || "white"; //Type de son choisi (bruit blanc par défaut)
    const {node: srcNode, stopAll} = moteuraudio.creerSourceTherapie(typeTherapie); //Création de la source audio
    const chaine_tmnmt = moteuraudio.ChaineTMNMT(srcNode, f_ac); //Application du protocole TMNMT

    moteuraudio.setgaindB(-18); //Ajustement du gain (-18 dBFS)

    //Timer
    const temps = parseFloat($("#duree-tmnmt").value); //Durée de la séance sélectionnée
    tmnmtTimer = timer_TMNMT(temps); //Démarrage du timer (fonction dédiée à cet effet)

    tmnmt_temps_debut = Date.now(); //Enregistrement du temps de départ pour pouvoir générer le rapport
    tmnmt_temps_ecoule = 0; //Réinitialisation du temps écoulé

    tmnmtStop = () => { //Nettoyage de la chaîne lorsqu'on arrête la thérapie
        try {stopAll?.();} catch {}
        try {chaine_tmnmt.notch.disconnect();} catch{}
        try {chaine_tmnmt.lowPeak.disconnect();} catch{}
        try {chaine_tmnmt.highPeak.disconnect();} catch {}
        };

    tmnmtEnCours = true; //Mise à jour de l'état global
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session"; //Mise à jour de l'affichage du bouton
}

/**
*Fonction de démarrage du TMNMT avec le mode personnalié, qui applique la chaine de filtrage sur le fichier audio importé et gère le timer.
*/
async function demarrerTMNMT_fichier(){
    //Démarrage et nettoyage global
    await assurerAudio();
    stopPitchMatching();
    try {arreterMWT();} catch {}
    try {arreterADT();} catch {}

    tmnmtRapport.innerHTML = '';
    fichierInvalide.textContent = ''; //Réinitialisation du message d'erreur

    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const srcFichier = fichier.files[0]; //Récupération de l'objet File déposé dans l'input 

    //Vérification du format du fichier 
    if (!srcFichier || !srcFichier.type.startsWith('audio/')){
        fichierInvalide.textContent = (langactuelle === "fr")? "Le format du fichier est invalide" : "Invalid file format"; //Affichage d'un message d'erreur si le fichier n'est pas un audio
        return;
    }

    let duree_fichier_sec = 0; //Initialisation de la durée du fichier
    try {
        const buffer = await moteuraudio.ModulerAudio(srcFichier, f_ac); //ModulerAduio charge, décode et applique le protocole au fichier, puis renvoie un AudioBuffer
        if (buffer && buffer.duration){ //Vérification que le buffer et sa durée existent
            duree_fichier_sec = buffer.duration; //Détermination de la longueur du fichier (durée)
        } else {
            throw new Error ("Impossible de trouver la durée du fichier audio.");
        }
    } catch (e) {
        console.error ("Erreur lors du traitement du fichier audio:", e); //Affichage d'un message d'erreur si le fichier de peut être décodé ou traité
        fichierInvalide.textContent = (langactuelle === "fr") ? "Assurez-vous que le format du fichier audio est supporté (MP3, WAV)," : "Ensure the format file is supporter (MP3, WAV).";
        return;
    }
    
    //Timer
    const temps_minutes = duree_fichier_sec/60;
    tmnmtTimer = timer_TMNMT(temps_minutes);

    tmnmt_temps_debut = Date.now();
    tmnmt_temps_ecoule = 0;

    tmnmtStop = () => {moteuraudio.arretSon();}; //Nettoyage en cas d'arrêt
    tmnmtEnCours = true;
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
    
}
/**
*Fonction qui gère l'arrêt d'une séance TMNMT, calcule le temps d'écoute finale, réinitialise le timer, la sortie audio et l'interface.
*/
function arreterTMNMT(){
    if (!tmnmtEnCours) return; //Sortie si aucune séance de TMNMT n'est en cours

    if (tmnmt_temps_debut !== null && !tmnmtEnPause){
        tmnmt_temps_ecoule += Date.now() - tmnmt_temps_debut; //Calcul du temps durant lequel la thérapie joue pour le rapport
    }
    const tmnmt_temps_final = tmnmt_temps_ecoule; //Stockage du temps d'écoute complet pour le rapport

    //Réinitialisation des variables
    tmnmtEnCours = false;
    tmnmtEnPause = false; 
    tmnmtTempsRestant = 0;  
    tmnmt_temps_debut = null;
    tmnmt_temps_ecoule = 0; 

    //Arrêt du timer
    clearInterval(tmnmtTimer); 
    tmnmtTimer = null;
    if (timerTMNMT) timerTMNMT.textContent = "00:00"; //Réinitialisation de l'affichage

    moteuraudio.transitionGain(-60, 0.4); //Mise du gain à 0 (avec un effet fondu de 0,4 secondes)

    //Nettoyage de la chaîne audio
    setTimeout(() => {
        if (tmnmtStop) tmnmtStop(); //Exécution de la fonction de nettoyage audio
        moteuraudio.setgaindB(-18); //Réinitialisation du gain
        genererBoutonRapportTMNMT(tmnmt_temps_final, tmnmtDureeChoisie); //Génération du bouton pour télécharger le rapport 
        tmnmtDureeChoisie = 0; //Réinitialisation de la durée sélectionnée
    }, 420);

    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Démarrer la séance d'écoute" : "Start listening session"; //Mise à jour du bouton
    
}

/**
*Fonction qui gère le chronomètre pour la thérapie TMNMT ainsi que son affichage.
*Elle démarre le décompte du temps restant depuis le début ou après une pause.
*@param {Number} temps, la durée en minutes de la séance.
*@param {Number} tmnmtInitialRestant, le temps en restant en millisecondes si la séance est reprise après une pause.
*@returns {Number} intervalle, l'ID généré par la fonction setInterval() pour arrêter le chronomètre manuellement. 
*/
function timer_TMNMT(temps, tmnmtInitialRestant = null){
    tmnmtDureeChoisie = temps; //Mise à jour de la variable globale (pour le rapport)
    const temps_total_ms = temps*60*1000; //Conversion du temps (minutes) en millisecondes
    let temps_fin; //Initialisation du temps jusqu'à la fin de la séance
    if (tmnmtInitialRestant !== null) {
        temps_fin = tmnmtInitialRestant; //Si le temps restant n'est pas vide (il y a eu une pause puis une reprise), le temps jusqu'à la fin est le temps restant
    } else {
        temps_fin = temps_total_ms; //Si le temps restant est vide (pas de pause), le temps jusqu'à la fin est le temps total
    }
    const fin = Date.now() + temps_fin; //Calcul de l'instant de fin de la thérapie
    
    //Affichage initial du timer (car il y a un temps de latence)
    const minutes_initiales = Math.floor(temps_fin/(60*1000)).toString().padStart(2, "0"); //Nombre de minutes initiales 
    const secondes_initiales = Math.floor((temps_fin/1000)%60).toString().padStart(2, "0"); //Nombre de secondes initiales 
    if (timerTMNMT){
        timerTMNMT.textContent = `${minutes_initiales}:${secondes_initiales}`; //Affichage du chronomètre
    }

    const intervalle = setInterval(()=>{ //Exécution du code du timer à intervalles réguliers (1000 millisecondes = 1 seconde). 
        //On note que setInterval() génère un identifiant numérique, qu'on a noté intervalle, et qui permettra par la suite d'arrêter le timer manuellement.
        const debut = Date.now(); //Instant de début de la thérapie (actuel)
        tmnmtTempsRestant = fin - debut; //Sauvegarde du temps restant pour la mise en pause

        const minutes = Math.floor(tmnmtTempsRestant/(60*1000)).toString().padStart(2, "0");
        const secondes = Math.floor((tmnmtTempsRestant/1000)%60).toString().padStart(2, "0");

        tmnmt_temps_ecoule = temps_total_ms - tmnmtTempsRestant; //Mise à jour du temps écoulé pour le rapport

        if (timerTMNMT){
            timerTMNMT.textContent = `${minutes}:${secondes}`; //Affichage
        } 
        
        if (tmnmtTempsRestant <= 0){ //Lorsque le temps restant est inférieur ou égal à 0 (séance finie)
            tmnmtTempsRestant = 0; //Réinitialisation du temps restant
            clearInterval(intervalle); //Arrêt de la boucle
            arreterTMNMT(); //Arrêt de la thérapie TMNMT
        }
    },1000);

    return intervalle; //Retour de l'ID de l'intervalle pour pouvoir arrêter le timer manuellement
}

/**
*Fonction qui gère les pauses de séance dans la thérapie TMNMT. 
*Elle arrête ou redémarre le chronomètre et le contexte audio avec les fonctions suspend/resume et ajuste l'affichage du bouton. 
*/
function PauseTMNMT(){
    if (!tmnmtEnCours) return; 
    
    if (tmnmtEnPause){ // Reprise après une mise en pause
        moteuraudio.std.resume(); // Utilisation de la fonction resume() de Web Audio API pour redémarrer le moteur audio
        const duree = parseFloat($("#duree-tmnmt").value); //Durée totale de la séance (re-lue)
        tmnmtTimer = timer_TMNMT(duree, tmnmtTempsRestant); //Redémarrage du timer en fonction de la durée totale et du temps restant
        tmnmtEnPause = false; //Mise à jour de la variable d'état globale
        tmnmt_temps_debut = Date.now(); //Mise à jour du temps de reprise 
        boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session"; //Mise à jour de l'affichage du bouton
        
    } else { // Mise en pause
        moteuraudio.std.suspend(); // Utilisation de la fonction suspend() de Web Audio API pour arrêter le moteur audio (sans le déconnecter)
        clearInterval(tmnmtTimer); //Arrêt de la boucle du timer
        tmnmtTimer = null; 
        tmnmtEnPause = true; //Mise à jour de la variable d'état globale
        if (tmnmt_temps_debut !== null){
            tmnmt_temps_ecoule += Date.now() - tmnmt_temps_debut; //Mise à jour du temps écoulé pour le rapport.
            tmnmt_temps_debut = null;
        }
        boutonTMNMT.textContent = (langactuelle === "fr") ? "Reprendre la séance" : "Resume session"; //Mise à jour de l'affichage du bouton
    }
}
/**
*Fonction qui affiche un bouton permettant de télécharger le rapport après une séance de thérapie TMNMT. Cette fonction permet d'afficher le bouton et de stocker les éléments
*à ajouter dans le rapport mais ne génère pas le rapport.
*@param {Number} temps_ecoute, le temps d'écoute réel de la séance (en considérant les pauses et les arrêts avant la fin), en millisecondes. 
*@param {Number} dureeChoisieMinutes, la durée initiale choisie par l'usager pour la séance. 
*/
function genererBoutonRapportTMNMT(temps_ecoute, dureeChoisieMinutes){
    //Affichage du bouton
    tmnmtRapport.innerHTML = ''; //Affichage et nettoyage du conteneur pour le bouton
    const boutonRapport = document.createElement('button'); //Création du bouton
    boutonRapport.textContent = (langactuelle === "fr") ? "Télécharger le rapport de séance" : "Download session report"; //Écriture sur le bouton

    //Informations pour le rapport
    const minutesChoisie = Math.floor(dureeChoisieMinutes).toString().padStart(2, "0"); //Minutes de la durée choisie 
    const secondesChoisie = Math.round((dureeChoisieMinutes*60)%60).toString().padStart(2, "0"); //Secondes de la durée choisie (utile lorsque le fichier audio est importé)
    const dureeChoisie = `${minutesChoisie} min ${secondesChoisie} sec`; //Mise en forme pour le rapport
    
    const minutes = Math.floor(temps_ecoute/60000).toString().padStart(2, "0"); //Minutes réellement écoutées
    const secondes = Math.floor((temps_ecoute/1000)%60).toString().padStart(2, "0"); //Secondes réellement écoutées
    const dureeEcoute = `${minutes} min ${secondes} sec`; //Mise en forme pour le rapport
    
    const f_ac = freq_ac || parseFloat(curseurfreq.value); //Fréquence des acouphènes (curseur)
    const fAc = `${f_ac} Hz`; //Mise en forme pour le rapport
    const mode = (tmnmtMode === 'base') ? 'Sons de base' : 'Fichier audio importé'; //Mode de TMNMT (sons de base ou fichier audio importé)
    const typeSon = (tmnmtMode === 'base') ? ($("#type")?.selectedOptions[0]?.textContent || 'N/A') : 'N/A'; //Type de son (bruit blanc, rose, onde sinusoidale, etc...)
    const nomFichier = (tmnmtMode === 'personnalise') ? (fichier.files[0]?.name || 'N/A') : 'N/A'; //Nom du fichier importé

    //Génération du rapport lorsque le bouton est cliqué
    boutonRapport.addEventListener('click', () => {
        genererRapportPDF('TMNMT', dureeChoisie, dureeEcoute, fAc, mode, typeSon, nomFichier, 'N/A', 'N/A', 'N/A'); //Appel d'une fonction dédiée à cet effet 
    });

    tmnmtRapport.appendChild(boutonRapport); //Ajout du bouton pour le rapport dans le conteneur 
}


// MWT //
/**
*Fonction de démarrage du MWT, qui génère le signal, applique la chaîne de filtrage et gère le timer.
*/
async function demarrerMWT() {
    await assurerAudio(); //Attente du contexte audio
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterTMNMT();} catch {} //Arrêt de la TMNMT si elle est en cours
    try {arreterADT();} catch {} //Arrêt de la ADT si elle est en cours 

    mwtRapport.innerHTML = ''; //Conteneur vide du rapport à télécharger

    const fc = parseFloat(curseurfreq.value); //Fréquence des acouphènes (fréquence porteuse)
    const fm = 10; //Fréquence de modulation (10Hz)
    const ca = 1; //Amplitude de la fréquence porteuse 
    const m = 1; //Profondeur de modulation
    const p = 0; //Phase 

    const {node, stopAll} = moteuraudio.ChaineMWT(fc, ca, fm, m, p); //Application du protocole MWT

    moteuraudio.setgaindB(-18); //Ajustement du gain (-18dBFS)

    node.connect(moteuraudio.comp); //Connexion du noeud de sortie au compresseur

    //Timer
    //La logique utilisée est la même que pour le TMNMT
    const temps = $("#duree-mwt").value
    mwtTimer = timer_MWT(temps);
    mwt_temps_debut = Date.now();
    mwt_temps_ecoule = 0;

    mwtStop = () => {
        try {stopAll(); } catch {}
        try {node.disconnect();} catch {}
    };

    mwtEnCours = true;
    if (boutonMWT) boutonMWT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
}
/**
*Fonction qui gère l'arrêt d'une séance MWT, calcule le temps d'écoute final, réinitialise le timer, la sortie audio et l'interface.
*/
function arreterMWT() {
    if (!mwtEnCours) return; //Sortie si aucune séance de MWT n'est en cours

    if (mwt_temps_debut !== null && !mwtEnPause){
        mwt_temps_ecoule += Date.now() - mwt_temps_debut; //Calcul du temps durant lequel la thérapie joue pour le rapport
    }
    const mwt_temps_final = mwt_temps_ecoule; //Stockage du temps d'écoute complet pour le rapport

    //Réinitialisation des variables
    mwtEnCours = false;
    mwtEnPause = false;
    mwtTempsRestant = 0; 
    mwt_temps_debut = null;
    mwt_temps_ecoule = 0;

    //Arrêt du timer
    clearInterval(mwtTimer);
    mwtTimer = null;
    if (timerMWT) timerMWT.textContent = "00:00"; //Réinitialisation de l'affichage

    //Nettoyage de la chaîne audio
    try {mwtStop?.(); } catch {}

    //Génération du bouton pour télécharger le rapport
    genererBoutonRapportMWT(mwt_temps_final);

    //Mise à jour du bouton
    if (boutonMWT) boutonMWT.textContent = (langactuelle === "fr") ? "Démarrer la séance d'écoute" : "Start listening session";
}
/**
*Fonction qui gère le chronomètre pour la thérapie MWT ainsi que son affichage.
*Elle démarre le décompte du temps restant depuis le début ou après une pause.
*@param {Number} temps, la durée de la séance sélectionnée en minutes.
*@param {Number} mwtInitialRestant, le temps restant en millisecondes si la séance est reprise après une pause.
*@returns {Number} intervalle, l'ID généré par la fonction setInterval() pour arrêter le chronomètre manuellement. 
*/
function timer_MWT(temps, mwtInitialRestant = null){
    //La logique et les fonctions utilisées sont les mêmes que pour la fonction timer_TMNMT
    const temps_total_ms = temps*60*1000;
    let temps_fin;
    if (mwtInitialRestant !== null) {
        temps_fin = mwtInitialRestant; //Si le temps restant n'est pas vide (il y a eu une pause puis une reprise), le temps jusqu'à la fin est le temps restant
    } else {
        temps_fin = temps_total_ms; //Si le temps restant est vide (pas de pause), le temps jusqu'à la fin est le temps total
    }
    const fin = Date.now() + temps_fin; 

    //Affichage du temps initial
    const minutes_initiales = Math.floor(temps_fin/(60*1000)).toString().padStart(2, "0");
    const secondes_initiales = Math.floor((temps_fin/1000)%60).toString().padStart(2, "0");
    if (timerMWT){
        timerMWT.textContent = `${minutes_initiales}:${secondes_initiales}`;
    }

    const intervalle = setInterval(()=>{ //Exécution du code à intervalles réguliers (1000 millisecondes = 1 seconde)
        const debut = Date.now();
        mwtTempsRestant = fin - debut;

        if (mwtTempsRestant <= 0){
            mwtTempsRestant= 0;
            clearInterval(intervalle);
            arreterMWT(); //Arrêt de MWT à la fin du timer
        }

        const minutes = Math.floor(mwtTempsRestant/(60*1000)).toString().padStart(2, "0");
        const secondes = Math.floor((mwtTempsRestant/1000)%60).toString().padStart(2, "0");
        
        mwt_temps_ecoule = temps_total_ms - mwtTempsRestant;

        if (timerMWT){
            timerMWT.textContent = `${minutes}:${secondes}`;
        } 
    },1000);
    return intervalle;
}
/**
*Fonction qui gère les pauses de séance dans la thérapie MWT. 
*Elle arrête ou redémarre le chronomètre et le contexte audio avec les fonctions suspend/resume et ajuste l'affichage du bouton. 
*/
function PauseMWT(){
    //La logique et les fonctions utilisées sont les même que pour la fonction PauseTMNMT()
    if (!mwtEnCours) return;
    const duree = parseFloat($("#duree-mwt").value);
    if (mwtEnPause){ // Reprise après une mise en pause
        moteuraudio.std.resume(); // Utilisation de la fonction resume() de Web Audio API pour redémarrer le moteur audio
        mwtTimer = timer_MWT(duree, mwtTempsRestant);
        mwtEnPause = false;
        mwt_temps_debut = Date.now();
        boutonMWT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
    } else { // Mise en pause
        moteuraudio.std.suspend(); // Utilisation de la fonction suspend() de Web Audio API
        clearInterval(mwtTimer);
        mwtTimer = null;
        mwtEnPause = true;
        if (mwt_temps_debut !== null){
            mwt_temps_ecoule += Date.now() - mwt_temps_debut;
            mwt_temps_debut = null;
        }
        boutonMWT.textContent = (langactuelle === "fr") ? "Reprendre la séance" : "Resume session";
    }
}
/**
*Fonction qui affiche un bouton permettant de télécharger le rapport après une séance de thérapie MWT. Cette fonction permet d'afficher le bouton et de stocker les éléments
*à ajouter dans le rapport mais ne génère pas le rapport.
*@param {Number} temps_ecoute, le temps d'écoute réel de la séance (en considérant les pauses et les arrêts avant la fin), en millisecondes. 
*@param {Number} dureeChoisieMinutes, la durée initiale choisie par l'usager pour la séance. 
*/
function genererBoutonRapportMWT(temps_ecoute){
    //Affichage du bouton
    mwtRapport.innerHTML = '';
    const boutonRapport = document.createElement('button');
    boutonRapport.textContent = (langactuelle === "fr") ? "Télécharger le rapport de séance" : "Download session report";

    //Informations pour le rapport
    const duree_choisie = parseFloat($("#duree-mwt").value);
    const dureeChoisie = `${duree_choisie} min`;
    const minutes = Math.floor(temps_ecoute/60000).toString().padStart(2, "0");
    const secondes = Math.floor((temps_ecoute/1000)%60).toString().padStart(2, "0");
    const dureeEcoute = `${minutes}min ${secondes}s`;
    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const fAc = `${f_ac} Hz`;

    //Génération du rapport lorsque le bouton est cliqué
    boutonRapport.addEventListener('click', () => {
        genererRapportPDF('MWT', dureeChoisie, dureeEcoute, fAc, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A');
    });

    mwtRapport.appendChild(boutonRapport); //Ajout du bouton pour le rapport dans son conteneur
}


// ADT //
/**
*Fonction de démarrage d'une nouvelle manche du jeu de ADT (entraînement à la discrimination auditive). 
*Cette fonction gère l'affichage, arrête les thérapies en cours et génère les signaux nécessaires.
*/
async function demarrerADT(){ 
    await assurerAudio(); //Attente du contexte audio
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterTMNMT();} catch {} //Arrêt de la TMNMT si elle est en cours
    try {arreterMWT();} catch {} //Arrêt de la MWT si elle est en encours

    //Génération des fréquences aléatoires aigues et graves (fonction dédiée à cet effet) en fonction de la fréquence des acouphènes
    frequencesADT(); 
    adtEnCours = true; //Mise à jour de la variable d'état globale (jeu en état actif)
    manchePrete = true; //Active la manche
    
    optionsADT.style.display = "block"; //Affichage des boutons du jeux (optionsADT)
    feedback.textContent = "";
    feedback.style.opacity = "0";
    boutonADT.textContent = (langactuelle === "fr") ? "Arrêter le jeu" : "Stop game"; //Mise à jour du bouton de démarrage et d'arrêt du jeu
}
/**
*Fonction qui gère la lecture et l'arrêt des sons pour le jeu de ADT avec les boutons.
*@param {HTMLElement} button, le bouton qui est cliqué (boutosonun pour le premier son et boutonsondeux pour le deuxième).
*@param {Number} freq, la fréquence associée au bouton cliqué (freq_un ou freq_deux)
*/
function jouerADT(button, freq){
    if (!adtEnCours) return;

    const arret = button.textContent.includes("Arrêter") || button.textContent.includes("Stop"); //Permet de déterminer si le bouton a été cliqué pour l'arrêt d'un son
    moteuraudio.arretSon();

    boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";

    if (arret) return;//Si un arrêt a été cliqué, on sort de la fonction après le nettoyage de l'audio
    
    //Sinon, on joue le ton à la fréquence voulue (onde sinusoidale à -36dBFS)
    moteuraudio.jouerPitch(freq, "sine", -36);
    button.textContent = (langactuelle === "fr") ? "Arrêter" : "Stop";
}
/**
*Fonction de gestion et vérification des réponses du jeu de ADT. 
*Elle permet de vérifier que l'utilisateur a reconnu le son le plus aigu.
*@param {Number} index, l'indice du son choisi par l'utilisateur (1 ou 2)
*/
function reponsesADT(index){ 
    if (!adtEnCours || !manchePrete) return;
    manchePrete = false;

    moteuraudio.arretSon(); //Arrêt de tous les sons
    //Réinitialisation des boutons 
    boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";

    if (index === aigu){ //Si l'index correspond au bouton cliqué par l'utilisateur pour la fréquence aigue
        feedback.textContent = (langactuelle === "fr") ? "Bonne réponse!" : "Good answer!";
        bonnes_reponses ++;
    } else { //Si l'index ne correspond pas au bouton cliqué par l'utilisateur pour la fréquence aigue
        feedback.textContent = (langactuelle === "fr") ? "Mauvaise réponse" : "Wrong answer";
        mauvaises_reponses ++;
    }

    feedback.style.opacity = "1";
    setTimeout (() => {feedback.style.opacity = "0";}, 1500);

    if (adtEnCours) {
        setTimeout(() => {
            if (adtEnCours) demarrerADT();
        }, 2000);
    }
}
/**
*Fonction d'arrêt du jeu de ADT.
*Cette fonction retire l'affichage (réinitialise l'interface utilisateur) et nettoie la chaîne audio.
*/
function arreterADT(){
    if (!adtEnCours) return;

    moteuraudio.arretSon(); //Arrêt de tous les sons
    adtEnCours = false; //Mise à jour de la variable d'état globale (jeu inactif)
    optionsADT.style.display = "none"; //Cache les boutons quand le jeu s'arrête

    //Sauvegarde des score avant de les réinitialiser 
    const bonnes = bonnes_reponses;
    const mauvaises = mauvaises_reponses;

    //Réinitialisation du décompte
    bonnes_reponses = 0;
    mauvaises_reponses = 0;
    
    genererBoutonRapportADT(bonnes, mauvaises);
    
    //Réinitialisation des boutons
    boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";
    boutonchoixun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonchoixdeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";
    boutonADT.textContent = (langactuelle === "fr") ? "Commencer le jeu" : "Start Game";
    feedback.textContent = ""; //Cache le message de feedback
}

function genererBoutonRapportADT(bonnes_reponses, mauvaises_reponses){
    //Affichage du bouton
    adtRapport.innerHTML = '';
    const boutonRapport = document.createElement('button');
    boutonRapport.textContent = (langactuelle === "fr") ? "Télécharger le rapport de séance" : "Download session report";

    //Informations pour le rapport
    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const fAc = `${f_ac} Hz`;
    const nombre_parties = bonnes_reponses + mauvaises_reponses;

    //Génération du rapport lorsque le bouton est cliqué
    boutonRapport.addEventListener('click', () => {
        genererRapportPDF('ADT', 'N/A', 'N/A', fAc, 'N/A', 'N/A', 'N/A', bonnes_reponses, mauvaises_reponses, nombre_parties);
    });

    adtRapport.appendChild(boutonRapport); //Ajout du bouton pour le rapport dans son conteneur
}

/**
*Fonction qui génère les fréquences à jouer pour le jeu de ADT en fonction de la fréquence des acouphènes de l'utilisateur. 
*Elle génère deux fréquences aléatoires, une aigue et une plus grave. 
*/
function frequencesADT(){ 
    const f_ac = freq_ac || parseFloat(curseurfreq.value); //Fréquence des acouphènes

    //On génère un nombre aléatoire entre 300Hz et 700Hz qui déterminera l'écart à la fréquence des acouphènes
    const i = Math.floor(Math.random()*(700-300+1)+300); //Math.floor permet d'arrondir à l'entier inférieur et Math.random permet de générer un nombre entre 0 et 1

    //On génère un nombre aléatoire entre 0 et 1, on regarde s'il est supérieur ou inférieur à 0.5 pour déterminer quelle fréquence (1 ou 2) sera aigue
    const nombre = Math.random()<0.5; 
    
    if (nombre){ //Si le nombre est inférieur à 0.5, la fréquence 1 est aigue
        freq_un = f_ac + i;
        freq_deux = f_ac -i;
        aigu = 1; //On pose la valeur de la constante aigu à 1 pour pouvoir valider la réponse de l'usager
    } else { //Si le nombre est supérieur à 0.5, la fréquence 2 est aigue
        freq_un = f_ac - i;
        freq_deux = f_ac + i;
        aigu = 2; //On pose la valeur de la constante aigu à 2 pour pouvoir valider la réponse de l'usager
    }
}


// Démarrage des thérapies en fonction de celle choisie et gestion des boutons //

//Gestionnaire du bouton qui permet de démarrer/arrêter la TMNMT
boutonTMNMT?.addEventListener('click', () => {
    if (!tmnmtEnCours || tmnmtEnPause){
        if (tmnmtEnPause) {
            PauseTMNMT(); // Reprise de la session si le bouton de reprise est pressé
        } else if (tmnmtMode === 'base'){
            demarrerTMNMT(); //Démarrage du mode de base
        } else if (tmnmtMode === 'personnalise'){
            demarrerTMNMT_fichier(); //Démarrage du mode personnalisé (fichier importé)
        }
    } else arreterTMNMT();
});
//Gestionnaire du bouton qui permet de mettre en pause/reprendre la TMNMT
boutonPauseTMNMT?.addEventListener('click', () => {
    if (tmnmtEnCours) {
        PauseTMNMT();
    }
})

//Gestionnaire du bouton qui permet de démarrer/arrêter la MWT
boutonMWT?.addEventListener('click', ()=>{
    if (mwtEnPause) {
        PauseMWT();
    } else if (!mwtEnCours){
        demarrerMWT();
    } else {
        arreterMWT();
    }
});
//Gestionnaire du bouton qui permet de mettre en pause/reprendre la MWT
boutonPauseMWT?.addEventListener('click', () => {
    if (mwtEnCours){
        PauseMWT();
    }
});

//Gestionnaire du bouton qui permet de démarrer/arrêter le jeu ADT
boutonADT?.addEventListener('click', () => {
    if (!adtEnCours) demarrerADT();
    else arreterADT();
});
//Gestionnaire du bouton de lecture/arrêt du premier son
boutonsonun.addEventListener('click', () => {
    jouerADT(boutonsonun, freq_un);
});

//Gestionnaire du bouton de lecture/arrêt du deuxième son
boutonsondeux.addEventListener('click', () => {
    jouerADT(boutonsondeux, freq_deux);
});
//Gestionnaire du bouton de réponse pour le choix du premier son
boutonchoixun.addEventListener('click', () => reponsesADT(1));
//Gestionnaire du bouton de réponse pour le choix du deuxième son
boutonchoixdeux.addEventListener('click', () => reponsesADT(2));

/**
*Fonction qui permet de générer le rapport en fichier PDF.
*Le fichier inclut, dans la langue préférée de l'utilisateur, la date, l'heure, le type de thérapie, la durée de la séance, le nom du fichier importé (s'il y a lieu)...
*@param {String} therapie, le type de thérapie choisie (TMNMT ou MWT).
*@param {String} dureeChoisie, la durée de séance sélectionnée par l'utilisateu (déja formatée en chaîne de caractères).
*@param {String} dureeEcoute, la durée réelle d'écoute de la séance (déja formatée en chaîne de caractères).
*@param {String} f_ac, la fréquence des acouphènes de l'utilisateur (déja formatée en chaîne de caractères).
*@param {String} typeSon, le type de son sélectionné pour la thérapie TMNMT (s'il y a lieu).
*@param {String} nomFichier, le nom du fichier importé par l'utilisateur pour la TMNMT (s'il y a lieu).
*/
function genererRapportPDF(therapie, dureeChoisie, dureeEcoute, fAc, mode, typeSon, nomFichier, bonnes_reponses, mauvaises_reponses, nombre_parties) {
    //Initialisation de jsPDF (bibliothèque qui permet de générer des documents PDF)
    const {jsPDF} = window.jspdf;
    //Création d'un nouveau document PDF 
    const doc = new jsPDF('p', 'mm', 'a4');

    //Variables de positionnement
    let y = 15; //Hauteur
    const lineHeight = 8; //Espacement entre les lignes
    const xStart = 10; //Marge (gauche)

    //Titres (anglais et français)
    doc.setFontSize(16);
    if (langactuelle === "fr"){
        doc.text("Rapport de séance de neuromodulation sonore", xStart, y);
        y += lineHeight * 2;
    } else {
        doc.text("Sound neuromodulation session report", xStart, y);
        y += lineHeight * 2;
    }
    
    //Date
    doc.setFontSize(10);
    const date = new Date().toLocaleString(langactuelle === 'fr' ? 'fr-FR' : 'en-US');
    doc.text(`Date : ${date}`, xStart, y);
    y += lineHeight;

    //Informations de la séance 
    y += lineHeight;
    if (therapie === 'TMNMT' || therapie === 'MWT'){
        if (langactuelle === "fr"){
            if (therapie === 'TMNMT'){
                doc.text(`Type de thérapie choisie: thérapie musicale personnalisée avec suppression de bande fréquentielle`, xStart, y);
                y += lineHeight;
                doc.text(`Mode d'écoute : ${mode}`, xStart, y);
                y += lineHeight;
                if (mode === "Sons de base"){
                    doc.text(`Type de son : ${typeSon}`, xStart, y);
                    y += lineHeight;
                } else if (mode === "Fichier audio importé"){
                    doc.text(`Fichier importé : ${nomFichier}`, xStart, y);
                    y += lineHeight;
                }
            } else if (therapie === 'MWT'){
                doc.text(`Type de thérapie choisie: thérapie par sons modulés`,xStart, y);
                y += lineHeight;
            }
            doc.text(`Durée de séance choisie: ${dureeChoisie}`, xStart, y);
            y += lineHeight;
            doc.text(`Durée d'écoute : ${dureeEcoute}`, xStart, y);
            y += lineHeight;
            doc.text(`Fréquence d'acouphènes sélectionnée: ${fAc}`, xStart, y);
            y += lineHeight *2;
        } else {
            if (therapie === 'TMNMT'){
                doc.text(`Chosen therapy type: tailor-made notched music training`, xStart, y);
                y += lineHeight;
                doc.text(`Mode : ${mode}`, xStart, y);
                y += lineHeight;
                if (mode === "Sons de base"){
                    doc.text(`Sound type : ${typeSon}`, xStart, y);
                    y += lineHeight;
                } else if (mode === "Fichier audio importé"){
                    doc.text(`Imported file : ${nomFichier}`, xStart, y);
                    y += lineHeight;
                }
            } else if (therapie === 'MWT'){
                doc.text(`Chosen therapy type: modulated wave therapy`, xStart, y);
                y += lineHeight;
            }
            doc.text(`Chosen session time: ${dureeChoisie}`, xStart, y);
            y += lineHeight;
            doc.text(`Listening time : ${dureeEcoute}`, xStart, y);
            y += lineHeight;
            doc.text(`Tinnitus frequency: ${fAc}`, xStart, y);
            y += lineHeight *2;
        }    
    } else if (therapie === 'ADT'){
        if (langactuelle === "fr"){
            doc.text(`Type de thérapie choisie: entraînement à la discrimination auditive`,xStart, y);
            y += lineHeight;
            doc.text(`Nombre de manches jouées: ${nombre_parties}`, xStart, y);
            y += lineHeight;
            doc.text(`Nombre de bonnes réponses: ${bonnes_reponses}`, xStart, y);
        } else {
            doc.text(`Chosen therapy type: auditory discrimination training`,xStart, y);
            y += lineHeight;
            doc.text(`Number of rounds played: ${nombre_parties}`, xStart, y);
            y += lineHeight;
            doc.text(`Number of right answers: ${bonnes_reponses}`, xStart, y);
            }    
    }
    

    //Sauvegarde du fichier
    const datePourNom = new Date().toISOString().slice(0,10);
    if (langactuelle === "fr"){
        doc.save(`Rapport_seance_${therapie}_${datePourNom}.pdf`);
    } else {
        doc.save(`Session_report_${therapie}_${datePourNom}.pdf`);
    }
}


// Changement de langue avec i18n //

//Définition du dictionnaire i18n
const i18n = {
    en: {
        titre: "Sound-based neuromodulation for chronic tinnitus",
        trouverfreqac : 'Find your tinnitus frequency',
        trouverfreqhint : "Sweep the slider and listen to the tones until you can match it to your perceived pitch. Leave the slider on this frequency once you've found it.",
        therapie: 'Type of therapy sound',
        freq_label: 'Frequency (Hz)',
        type_sinus: 'Sine',
        type_triangle: 'Triangle',
        type_carre: 'Square',
        type_scie: 'Sawtooth',
        TMNMT_label: 'Tailor-made notched music training',
        MWT_label: 'Modulated wave therapy',
        ADT_label: 'Auditory discrimination training',
        duree_label: 'Duration of the listening session',
        generation_bouton: 'Start session',
        type_label: 'Sound type',
        bruit_blanc: 'White noise',
        bruit_rose: 'Pink noise',
        bruit_sinus: 'Sine wave',
        bruit_triangle: 'Triangle wave',
        bruit_carre: 'Square wave',
        bruit_scie: 'Sawtooth wave',
        fichier_perso_label: "Load your audio file",
        base_label: "Basic sounds",
        personnalise_label: "Use my own audio file",
        description_titre: "Sound neuromodulation therapy is a non-invasice and simple method for reducing the perception of chronic tinnitus. Using this software, determine the frequency of your tinnitus and regularly follow the suggested treatments over several months to alleviate it.",
        choix_therapie: "Choose the type of therapy you wish to follow.",
        description_tmnmt: "Tailor-made notched music therapy is based on removing a frequency band containing the frequency of your tinnitus from an audio file. You can choose to use the basic sounds offered by the software (white noise, pink noise and other sound waves) or import your own audio file.",
        description_mwt: "Modulated wave therapy is based on the modulation in amplitude, frequency and phase of a sinusoidal signal around the frequency of your tinnitus.",
        description_adt: "Auditory discrimination training involves practicing identifying the higher-pitch sound among two sounds whose frequencies are close to that of your tinnitus.",
        commencer_jeu: "Start game",
        ecouter_jeu:"Listen to both sounds",
        son_un: "First sound",
        son_deux: "Second sound",
        choisir_son: "Choose the highest pitched sound",
    },
    fr: {
        titre: "Neuromodulation sonore pour les acouphènes chroniques",
        trouverfreqac: "Déterminez la fréquence de vos acouphènes",
        trouverfreqhint : "Glissez le curseur et testez les sons jusqu'à trouver la fréquence qui correspond le mieux à vos acouphènes. Laissez-le curseur sur cette fréquence lorsque vous l'avez trouvée.",
        therapie: "Type de thérapie sonore",
        freq_label: 'Fréquence (Hz)',
        type_sinus: 'Sinusoïde',
        type_triangle: 'Triangulaire',
        type_carre: 'Carré',
        type_scie: 'Dents de scie',
        TMNMT_label: 'Thérapie musicale personnalisée avec suppression de bande fréquentielle',
        MWT_label: 'Thérapie par sons modulés',
        ADT_label: 'Entraînement à la discrimination auditive',
        duree_label: "Durée de la séance d'écoute",
        generation_bouton:"Démarrer la séance",
        type_label: 'Type de son',
        bruit_blanc: 'Bruit blanc',
        bruit_rose: 'Bruit rose',
        bruit_sinus: 'Onde sinusoïdale',
        bruit_triangle: 'Onde triangulaire',
        bruit_carre: 'Onde carre',
        bruit_scie: 'Onde en dents de scie',
        fichier_perso_label: "Chargez votre fichier audio", 
        base_label: "Sons de base",
        personnalise_label: "Utiliser mon propre fichier audio",
        description_titre: "La thérapie par neuromodulation sonore constitue une méthode non-invasive et simple pour diminuer la perception des acouphènes chroniques. À l'aide de ce logiciel, déterminez la fréquence de vos acouphènes et suivez régulièrement, durant plusieurs mois, les traitements proposés afin de les soulager.",
        choix_therapie: "Choisissez le type de thérapie que vous souhaitez suivre.",
        description_tmnmt: "La thérapie musicale personnalisée avec suppression de bande fréquentielle se base sur la suppression d'une bande fréquentielle contenant la fréquence de vos acouphènes d'un fichier audio. Vous pouvez choisir d'utiliser les sons de base offerts par le logiciel (bruit blanc, bruit rose et autres ondes), ou d'importer votre propre fichier audio.",
        description_mwt: "La thérapie par sons modulés repose sur la modulation en amplitude, en fréquence et en phase d'un signal sinusoïdal autour de la fréquence de vos acouphènes.",
        description_adt: "L'entraînement à la discrimination auditive consiste à vous pratiquer à repérer le son le plus aigu parmi deux sons dont les fréquences sont proches de celle de vos acouphènes.",
        commencer_jeu: "Commencer le jeu",
        ecouter_jeu:"Écouter les deux sons",
        son_un: "Premier son",
        son_deux: "Deuxième son",
        choisir_son: "Choisir le son le plus aigu",
    }
};


/**
*Fonction qui permet de changer la langue de l'interface utilisateur. Elle met à jour tout le texte grâce au dictionnaire i18n.
*@param {String} lang, la nouvelle langue à appliquer ("fr" pour français et "en" pour anglais)
*/
function changerlang(lang) {
    langactuelle = lang; //Mise à jour de la variable d'état globale de la langue.
    
    //Traduction des textes
    $$("[data-i18n]").forEach((element) => { //Sélection des éléments avec l'attribut data-i18n
        const key = element.getAttribute("data-i18n"); //Lecture de la valeur des éléments
        const txt = i18n[lang][key]; //Traduction à partir du dictionnaire i18n
        if (txt) element.textContent = txt; //Remplacement du texte sélectionné par sa traduction
    });
    //Détermination du bouton actif pour déterminer la langue à appliquer
    $$(".lang button").forEach((b) => b.classList.toggle("active", b.dataset.langue === lang));
    //Changement de langue du bouton du test de pitch-matching
    if (enLecture){
        boutontest.textContent = lang === "fr" ? "Arrêter" : "Stop";
    } else {
        boutontest.textContent = lang === "fr" ? "Tester le ton" : "Test tone";
        }
}

//Changement de la langue à l'activation du bouton de langue
$$(".lang button").forEach((bouton) => {
    bouton.addEventListener("click", () => changerlang(bouton.dataset.langue));
    });

//Configuration initiale de l'interface 
freqactuelle(curseurfreq.value);
changerlang("fr");








