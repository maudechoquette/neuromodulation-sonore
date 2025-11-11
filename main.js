import {ModulateurAudio} from "./audio.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const moteuraudio = new ModulateurAudio(); //Création du moteur audio pour gérer les fonctions

// Sélecteurs pour le pitch-matching
const curseurfreq = $("#freq");
const freqout = $("#freqout");
const typesel = $("#typeton");
const boutontest = $("#choixton");

let enLecture = false;

let freq_ac = null;

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
let tmnmtMode = 'base';
let tmnmt_temps_debut = null;
const tmnmtRapport = $("#tmnmt-rapport");
//Cas où le fichier n'est pas valide
const fichierInvalide = document.createElement('span');
optionsPerso.appendChild(fichierInvalide); //Ajout de l'élément
let tmnmtDureeChoisie = 0;

// Sélecteurs pour la MWT
const optionsMWT = $("#options-mwt");
const boutonMWT = $("#bouton-mwt"); 
const timerMWT = $("#mwt_timer");
const boutonPauseMWT = $("#pause-mwt");
let mwt_temps_debut = null;
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
let adtEnCours = false;
let freq_un = 0;
let freq_deux = 0;
let aigu = 0;

// Fonction d'affichage de la fréquence actuelle du curseur 
function freqactuelle(val){
    freqout.textContent = `${val} Hz`;
}

// Fonction qui assure que le système audio est prêt
async function assurerAudio(){
    await moteuraudio.init(); // Attente du modulateur audio
    try {if (moteuraudio.std?.state === 'suspended') await moteuraudio.std.resume(); } catch {}
}


// Test de pitch-matching //
// Fonction qui s'active lorsque le bouton de test de fréquence est cliqué
boutontest.addEventListener("click", async() => {
    await assurerAudio(); //Attente pour assurer que le système audio est prêt
    const f = parseFloat(curseurfreq.value); //Lecture de la valeur du curseur et conversion en valeur flottante
    const t = typesel.value; //Lecture de la forme d'onde choisie 

    if (!enLecture) {
        moteuraudio.jouerPitch(f, t, -36); //Lecture du pitch de la forme d'onde et fréquence sélectionnée
        enLecture = true;
        boutontest.textContent = langactuelle === "fr" ? "Arrêter" : "Stop";
    } else {
        moteuraudio.arretSon(); //Arrêt du son actuellement en cours
        enLecture = false;
        boutontest.textContent = langactuelle === "fr" ? "Tester le ton" : "Test tone";
        freq_ac = parseFloat(curseurfreq.value);
    }
});

function stopPitchMatching(){
    try {moteuraudio.arretSon();} catch {}
    enLecture = false;
    if (boutontest) {
        boutontest.textContent = (langactuelle === "fr") ? "Tester le ton" : "Test tone";
    }
}

//
curseurfreq.addEventListener("input", () => {
    const f = parseFloat(curseurfreq.value); //Lecture de la valeur du curseur et conversion en valeur flottante
    freqactuelle(f); //Mise à jour de la valeur de fréquence affichée
    if (enLecture) moteuraudio.defFreq(f); //Jouer la fréquence choisie 
    freq_ac = f;
});

// Neuromodulation //
function choisirTherapie(mode){
    stopPitchMatching(); //Arrêt du test de pitch-matching
    try {arreterMWT(); } catch {} //Arrêt de la MWT si en cours
    try {arreterTMNMT(); } catch {} //Arrêt de la TMNMT si en cours
    try {arreterADT(); } catch {} //Arrêt de la ADT si en cours

    // Boutons actifs
    boutonstherapie.forEach(bouton => bouton.classList.toggle('active', bouton.dataset.mode === mode));

    //Cacher toutes les thérapies avant de choisir celle qu'on veut 
    document.querySelectorAll('.panel').forEach(section => section.classList.remove('is-open'));

    // Affichage des options selon la thérapie choisie
    if (mode === "TMNMT"){ //Si TMNMT choisie
        optionsTMNMT.classList.add('is-open'); //Afficher les options de TMNMT (dans style.css ca affiche quand l'option is-open est activée)
        modeTMNMT('base'); //On met le mode base par défault
    } else if (mode === "MWT"){//Si MWT choisie
        optionsMWT.classList.add('is-open');
    } else if (mode === "ADT"){
        panelADT.classList.add('is-open');
        optionsADT.style.display = "none";
    }

    // Reset des timers et boutons
    if (timerTMNMT) timerTMNMT.textContent = "00:00";
    if (timerMWT) timerMWT.textContent = "00:00";
    if (boutonMWT) boutonMWT.textContent = (langactuelle === "fr") ? "Démarrer la séance" : "Start listening session";
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Démarrer la séance" : "Start listening session";
    }

// Sélection de la thérapie en fonction des boutons
boutonstherapie.forEach(bouton => {
    bouton.addEventListener('click', () => choisirTherapie(bouton.dataset.mode));
});


// TMNMT //
let tmnmtEnCours = false; 
let tmnmtStop = null;
let tmnmtTimer = null;
let tmnmtEnPause = false;
let tmnmtTempsRestant = 0;
let tmnmt_temps_ecoule = 0;

// Choix du mode de TMNMT : sons de base ou fichier audio chargé par l'utilisateur
function modeTMNMT(mode_tmnmt){
    tmnmtMode = mode_tmnmt;
    boutonBase.classList.toggle('active', mode_tmnmt === 'base'); //Si le bouton de base est choisi on utilise les sons de base
    boutonPerso.classList.toggle('active', mode_tmnmt === 'personnalise'); //Si le bouton de fichier personnalisé est choisi on utilise le fichier fourni
    if (mode_tmnmt === "base"){
        optionsBase.style.display = "";
        optionsPerso.style.display = 'none';
        fichierInvalide.textContent = '';
        dureeTMNMT.disabled = false; //On a besoin de la durée de séance si le TMNMT est utilisé en mode "base".
    } else if (mode_tmnmt === "personnalise"){
        optionsBase.style.display = "none";
        optionsPerso.style.display = '';
        dureeTMNMT.disabled = true; //Si le TMNMT est utilisé en mode personnalisé, on n'a pas besoin de la durée de séance. 
    } 
}
boutonBase.addEventListener('click', () => modeTMNMT('base'));
boutonPerso.addEventListener('click', () => modeTMNMT('personnalise'));

//Démarrage du TMNMT de base 
async function demarrerTMNMT(){
    await assurerAudio();
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterMWT();} catch {} //Arrêt de la MWT si elle est en cours

    tmnmtRapport.innerHTML = ''; //Container pour télécharger le rapport

    const f_ac = freq_ac || parseFloat(curseurfreq.value); //Définition de la fréquence de l'acouphène
    const typeTherapie = document.querySelector("#type")?.value || "white";
    const {node: srcNode, stopAll} = moteuraudio.creerSourceTherapie(typeTherapie);
    const chaine_tmnmt = moteuraudio.ChaineTMNMT(srcNode, f_ac);

    moteuraudio.setgaindB(-18); //Ajustement du gain

    //Timer
    
    const temps = parseFloat($("#duree-tmnmt").value);
    tmnmtTimer = timer_TMNMT(temps);

    tmnmt_temps_debut = Date.now(); //Enregistrement du temps de départ pour pouvoir générer le rapport
    tmnmt_temps_ecoule = 0; 

    tmnmtStop = () => {
        try {stopAll?.();} catch {}
        try {chaine_tmnmt.notch.disconnect();} catch{}
        try {chaine_tmnmt.lowPeak.disconnect();} catch{}
        try {chaine_tmnmt.highPeak.disconnect();} catch {}
        };

    tmnmtEnCours = true;
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
}

//Démarrage du TMNMT à partir d'un fichier audio de l'utilisateur
async function demarrerTMNMT_fichier(){
    await assurerAudio();
    stopPitchMatching();
    try {arreterMWT();} catch {}

    tmnmtRapport.innerHTML = '';
    fichierInvalide.textContent = ''; //Message d'erreur vide au départ

    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const srcFichier = fichier.files[0];

    //Vérification du fichier 
    if (!srcFichier || !srcFichier.type.startsWith('audio/')){
        fichierInvalide.textContent = (langactuelle === "fr")? "Le format du fichier est invalide" : "Invalid file format"; //Affichage d'un message d'erreur si le fichier n'est pas un audio
        return;
    }
    //try {await moteuraudio.ModulerAudio(srcFichier, f_ac); } catch {}

    //Longueur du fichier (durée)
    let duree_fichier_sec = 0; //Initialisation
    try {
        const buffer = await moteuraudio.ModulerAudio(srcFichier, f_ac);
        if (buffer && buffer.duration){ //Vérification que le buffer et sa durée existent
            duree_fichier_sec = buffer.duration
        } else {
            throw new Error ("Impossible de trouver la durée du fichier audio.");
        }
        
    } catch (e) {
        console.error ("Erreur lors du traitement du fichier audio:", e);
        fichierInvalide.textContent = (langactuelle === "fr") ? "Assurez-vous que le format du fichier audio est supporté (MP3, WAV)," : "Ensure the format file is supporter (MP3, WAV).";
        return;
    }


    //Timer
    const temps_minutes = duree_fichier_sec/60;
    tmnmtTimer = timer_TMNMT(temps_minutes);

    tmnmt_temps_debut = Date.now();
    tmnmt_temps_ecoule = 0;

    tmnmtStop = () => {moteuraudio.arretSon();};
    tmnmtEnCours = true;
    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
    
}

function arreterTMNMT(){
    if (!tmnmtEnCours) return;

    if (tmnmt_temps_debut !== null && !tmnmtEnPause){
        tmnmt_temps_ecoule += Date.now() - tmnmt_temps_debut; //Calcul du temps durant lequel la thérapie joue pour le rapport
    }
    const tmnmt_temps_final = tmnmt_temps_ecoule;

    tmnmtEnCours = false;
    tmnmtEnPause = false; 
    tmnmtTempsRestant = 0; //Réinitialisation
    tmnmt_temps_debut = null;
    tmnmt_temps_ecoule = 0;

    clearInterval(tmnmtTimer);
    tmnmtTimer = null;

    if (timerTMNMT) timerTMNMT.textContent = "00:00"; //Réinitialisation de l'affichage du timer

    moteuraudio.transitionGain(-60, 0.4);
    setTimeout(() => {
        if (tmnmtStop) tmnmtStop();
        moteuraudio.setgaindB(-18);
        genererBoutonRapportTMNMT(tmnmt_temps_final, tmnmtDureeChoisie);
        tmnmtDureeChoisie = 0; //Réinitialisation
    }, 420);

    if (boutonTMNMT) boutonTMNMT.textContent = (langactuelle === "fr") ? "Démarrer la séance d'écoute" : "Start listening session";
    
}

function timer_TMNMT(temps, tmnmtInitialRestant = null){
    tmnmtDureeChoisie = temps;
    const temps_total_ms = temps*60*1000; //Conversion du temps (minutes) en millisecondes
    let temps_fin;
    if (tmnmtInitialRestant !== null) {
        temps_fin = tmnmtInitialRestant; //Si le temps restant n'est pas vide (il y a eu une pause puis une reprise), le temps jusqu'à la fin est le temps restant
    } else {
        temps_fin = temps_total_ms; //Si le temps restant est vide, le temps jusqu'à la fin est le temps total
    }
    const fin = Date.now() + temps_fin; 
    
    //Affichage initial du timer (car il y a un temps de latence)
    const minutes_initiales = Math.floor(temps_fin/(60*1000)).toString().padStart(2, "0");
    const secondes_initiales = Math.floor((temps_fin/1000)%60).toString().padStart(2, "0");
    if (timerTMNMT){
        timerTMNMT.textContent = `${minutes_initiales}:${secondes_initiales}`;
    }

    const intervalle = setInterval(()=>{ //Exécution du code à intervalles réguliers (1000 millisecondes = 1 seconde)
        const debut = Date.now();
        tmnmtTempsRestant = fin - debut; //Sauvegarde du temps restant pour mettre en pause

        const minutes = Math.floor(tmnmtTempsRestant/(60*1000)).toString().padStart(2, "0");
        const secondes = Math.floor((tmnmtTempsRestant/1000)%60).toString().padStart(2, "0");

        tmnmt_temps_ecoule = temps_total_ms - tmnmtTempsRestant; //Mise à jour du temps écoulé pour le rapport

        if (timerTMNMT){
            timerTMNMT.textContent = `${minutes}:${secondes}`;
        } 
        
        if (tmnmtTempsRestant <= 0){
            tmnmtTempsRestant = 0;
            clearInterval(intervalle);
            arreterTMNMT(); //Arrêt de TMNMT à la fin du timer
        }
    },1000);

    return intervalle;
}

function PauseTMNMT(){
    if (!tmnmtEnCours) return;
    if (tmnmtEnPause){ // Reprise après une mise en pause
        moteuraudio.std.resume(); // Utilisation de la fonction resume() de Web Audio API
        const duree = parseFloat($("#duree-tmnmt").value);
        tmnmtTimer = timer_TMNMT(duree, tmnmtTempsRestant);
        tmnmtEnPause = false;
        tmnmt_temps_debut = Date.now();
        boutonTMNMT.textContent = (langactuelle === "fr") ? "Arrêter la séance" : "Stop session";
    } else { // Mise en pause
        moteuraudio.std.suspend(); // Utilisation de la fonction suspend() de Web Audio API
        clearInterval(tmnmtTimer);
        tmnmtTimer = null;
        tmnmtEnPause = true;
        if (tmnmt_temps_debut !== null){
            tmnmt_temps_ecoule += Date.now() - tmnmt_temps_debut;
            tmnmt_temps_debut = null;
        }
        boutonTMNMT.textContent = (langactuelle === "fr") ? "Reprendre la séance" : "Resume session";
    }
}

function genererBoutonRapportTMNMT(temps_ecoute, dureeChoisieMinutes){
    //Affichage du boutons
    tmnmtRapport.innerHTML = '';
    const boutonRapport = document.createElement('button');
    boutonRapport.textContent = (langactuelle === "fr") ? "Télécharger le rapport de séance" : "Download session report";

    //Informations pour le rapport
    const minutesChoisie = Math.floor(dureeChoisieMinutes).toString().padStart(2, "0");
    const secondesChoisie = Math.round((dureeChoisieMinutes*60)%60).toString().padStart(2, "0");
    const dureeChoisie = `${minutesChoisie} min ${secondesChoisie} sec`;
    
    const minutes = Math.floor(temps_ecoute/60000).toString().padStart(2, "0");
    const secondes = Math.floor((temps_ecoute/1000)%60).toString().padStart(2, "0");
    const dureeEcoute = `${minutes} min ${secondes} sec`;
    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const fAc = `${f_ac} Hz`;
    const mode = (tmnmtMode === 'base') ? 'Sons de base' : 'Fichier audio importé';
    const typeSon = (tmnmtMode === 'base') ? ($("#type")?.selectedOptions[0]?.textContent || 'N/A') : 'N/A';
    const nomFichier = (tmnmtMode === 'personnalise') ? (fichier.files[0]?.name || 'N/A') : 'N/A';

    //Génération du rapport lorsque le bouton est cliqué
    boutonRapport.addEventListener('click', () => {
        genererRapportPDF('TMNMT', dureeChoisie, dureeEcoute, fAc, mode, typeSon, nomFichier);
    });

    tmnmtRapport.appendChild(boutonRapport);
}


// MWT //
let mwtEnCours = false;
let mwtStop = null;
let mwtTimer = null;
let mwtEnPause = false;
let mwtTempsRestant = 0;
let mwt_temps_ecoule = 0;

async function demarrerMWT() {
    await assurerAudio();
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterTMNMT();} catch {} //Arrêt de la MWT si elle est en cours

    mwtRapport.innerHTML = '';

    const fc = parseFloat(curseurfreq.value);
    const fm = 10;
    const ca = 1;
    const m = 1;
    const p = 0;

    const {node, stopAll} = moteuraudio.ChaineMWT(fc, ca, fm, m, p);

    moteuraudio.setgaindB(-18);

    node.connect(moteuraudio.comp);

    //Timer
    
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

function arreterMWT() {
    if (!mwtEnCours) return;

    if (mwt_temps_debut !== null && !mwtEnPause){
        mwt_temps_ecoule += Date.now() - mwt_temps_debut;
    }
    const mwt_temps_final = mwt_temps_ecoule;

    mwtEnCours = false;
    mwtEnPause = false;
    mwtTempsRestant = 0; //Réinitialisation
    mwt_temps_debut = null;
    mwt_temps_ecoule = 0;

    clearInterval(mwtTimer);
    mwtTimer = null;
    if (timerMWT) timerMWT.textContent = "00:00";
    try {mwtStop?.(); } catch {}

    genererBoutonRapportMWT(mwt_temps_final);
    
    if (boutonMWT) boutonMWT.textContent = (langactuelle === "fr") ? "Démarrer la séance d'écoute" : "Start listening session";

}

function timer_MWT(temps, mwtInitialRestant = null){
    const temps_total_ms = temps*60*1000;
    let temps_fin;
    if (mwtInitialRestant !== null) {
        temps_fin = mwtInitialRestant; //Si le temps restant n'est pas vide (il y a eu une pause puis une reprise), le temps jusqu'à la fin est le temps restant
    } else {
        temps_fin = temps_total_ms; //Si le temps restant est vide, le temps jusqu'à la fin est le temps total
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
            arreterMWT(); //Arrêt de TMNMT à la fin du timer
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

function PauseMWT(){
    if (!mwtEnCours) return;
    const duree = parseFloat($("#duree-mwt").value);
    if (mwtEnPause){ // Reprise après une mise en pause
        moteuraudio.std.resume(); // Utilisation de la fonction resume() de Web Audio API
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

function genererBoutonRapportMWT(temps_ecoute){
    //Affichage du boutons
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
        genererRapportPDF('MWT', dureeChoisie, dureeEcoute, fAc, 'N/A', 'N/A', 'N/A');
    });

    mwtRapport.appendChild(boutonRapport);
}


// ADT 
async function demarrerADT(){ //Démarrage d'une nouvelle manche
    await assurerAudio();
    stopPitchMatching(); //Arrêt du son de pitch-matching s'il y en a un en cours
    try {arreterTMNMT();} catch {} //Arrêt de la MWT si elle est en cours
    try {arreterMWT();} catch {}
    arreterADT(); //Arrêt de l'ancien jeu (au cas où)
    frequencesADT(); //Génération des fréquences aléatoires aigues et graves
    adtEnCours = true;
    optionsADT.style.display = "block";
    //Mise à jour des boutons
    boutonADT.textContent = (langactuelle === "fr") ? "Arrêter le jeu" : "Stop game";
}
function jouerADT(button, freq){ //Lecture des sons pour le jeu
    if (!adtEnCours) return;

    const arret = button.textContent.includes("Arrêter") || button.textContent.includes("Stop");

    if (moteuraudio.sonActuel){ 
        moteuraudio.arretSon();//Arrêt du son déjà en cours s'il y en a un
        //Réinitialisation des boutons (au besoin)
        boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
        boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";
    }

    if (arret){
        return;
    }
    
    moteuraudio.jouerPitch(freq, "sine", -36);
    button.textContent = (langactuelle === "fr") ? "Arrêter" : "Stop";
}
function reponsesADT(index){ //Gestion et vérification des réponses
    if (!adtEnCours) return;

    moteuraudio.arretSon();
    boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";

    if (index === aigu){ //L'index correspond au bouton cliqué par l'utilisateur pour la fréquence aigue
        feedback.textContent = (langactuelle === "fr") ? "Bonne réponse!" : "Good answer!";
        setTimeout(demarrerADT, 2500); //Attente de 2,5 secondes avant de pouvoir recommencer 
    } else {
        feedback.textContent = (langactuelle === "fr") ? "Mauvaise réponse" : "Wrong answer";
        setTimeout(demarrerADT, 2500);
    }
}
function arreterADT(){
    if (!adtEnCours) return;

    moteuraudio.arretSon(); //Arrêt de tous les sons
    adtEnCours = false;
    optionsADT.style.display = "none"; //Cache les boutons quand le jeu s'arrête
    //Réinitialisation des boutons
    boutonsonun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonsondeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";
    boutonchoixun.textContent = (langactuelle === "fr") ? "Premier son" : "First sound";
    boutonchoixdeux.textContent = (langactuelle === "fr") ? "Deuxième son" : "Second sound";
    boutonADT.textContent = (langactuelle === "fr") ? "Commencer le jeu" : "Start Game";
    feedback.textContent = "";
}
function frequencesADT(){ //Fonction qui choisit les valeurs aléatoires des fréquences à jouer à l'utilisateur 
    const f_ac = freq_ac || parseFloat(curseurfreq.value);
    const i = Math.floor(Math.random()*(700-300+1)+300); //Math.floor pour arrondir à l'entier inférieur et Math.random pour générer un nombre entre 0 et 1
    const nombre = Math.random()<0.5; //On génère un nombre au hasard entre 0 et 1, et on détermine s'il est inférieur à 0,5

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

// Démarrage des thérapies en fonction de celle choisie et gestion des boutons

boutonTMNMT?.addEventListener('click', () => {
    if (!tmnmtEnCours || tmnmtEnPause){
        if (tmnmtEnPause) {
            PauseTMNMT(); // Reprise de la session si le bouton de reprise est pressé
        } else if (tmnmtMode === 'base'){
            demarrerTMNMT();
        } else if (tmnmtMode === 'personnalise'){
            demarrerTMNMT_fichier();
        }

    } else arreterTMNMT();
});
boutonPauseTMNMT?.addEventListener('click', () => {
    if (tmnmtEnCours) {
        PauseTMNMT();
    }
})

boutonMWT?.addEventListener('click', ()=>{
    if (mwtEnPause) {
        PauseMWT();
    } else if (!mwtEnCours){
        demarrerMWT();
    } else {
        arreterMWT();
    }
});
boutonPauseMWT?.addEventListener('click', () => {
    if (mwtEnCours){
        PauseMWT();
    }
});

boutonADT?.addEventListener('click', () => {
    if (!adtEnCours) demarrerADT();
    else arreterADT();
});
boutonsonun.addEventListener('click', () => {
    jouerADT(boutonsonun, freq_un);
});
boutonsondeux.addEventListener('click', () => {
    jouerADT(boutonsondeux, freq_deux);
});
boutonchoixun.addEventListener('click', () => reponsesADT(1));
boutonchoixdeux.addEventListener('click', () => reponsesADT(2));

// Génération du fichier PDF
function genererRapportPDF(therapie, dureeChoisie, dureeEcoute, fAc, mode, typeSon, nomFichier) {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    let y = 15;
    const lineHeight = 8;
    const xStart = 10;

    //Titres (anglais et français)
    doc.setFontSize(16);
    if (langactuelle === "fr){
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
        trouverfreqhint : 'Sweep the slider and listen to the tones until you can match it to your perceived pitch.',
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
        choix_therapie: "Choose the type of therapy you wish to pursue",
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
        trouverfreqhint : "Glissez le curseur et testez les sons jusqu'à trouver la fréquence qui correspond le mieux à vos acouphènes",
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
        description_titre: "La thérapie par neuromodulation sonore constitue une méthode non-invasive et simple de diminuer la perception des acouphènes chroniques. À l'aide de ce logiciel, déterminez la fréquence de vos acouphènes et suivez régulièrement, durant plusieurs mois, les traitements proposés afin de les soulager.",
        choix_therapie: "Choisissez le type de thérapie que vous souhaitez suivre",
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

let langactuelle = "fr"

//Définition de la fonction permettant de changer la langue
function changerlang(lang) {
    langactuelle = lang;
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

