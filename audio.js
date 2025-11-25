/**
* Fonction de conversion d'une valeur en dB (décibels) en une valeur d'amplitude linéaire (0 à 1), car le Web Audio API
* utilise des valeurs linéaires pour les gains. La formule de conversion est 10^(db/20), avec db la valeur en décibels.
* @param {Number} db, la valeur en décibels à convertir.
* @returns {Number} la valeur d'amplitude correspondante.
*/
export function dbToLin(db) {return Math.pow(10, db/20);}

/**
*@class ModulateurAudio 
* Classe principale qui contient toutes les opérations de traitements audios.
*/
export class ModulateurAudio {
    constructor() {
        //Initialisation des proptiétés internes nécessaires
        this.std = null; //Contexte audio ("studio")
        this.gain = null; //Gain du signal de sortie principal (contrôle le volume global final)
        this.comp = null; //Compresseur pour éviter les pics de volume et protéger l'audition de l'utilisateur 
        this.analyser = null; //Analyseur des sons sortants (feeback) 
        this.freqechantillonnage = 48000; //Définition de la fréquence d'échantillonnage (fmax = 24000Hz)
    }

    /**
    *@async
    *@method init
    *Méthode qui initialise le contexte audio et configure la chaîne de traitement audio principale du logiciel:
    *compresseur > gain global > analyseur > sortie.
    */
    async init(){
        if (this.std) return;
        this.std = new (window.AudioContext || window.webkitAudioContext)(); //Création du contexte audio ("studio") grâce à l'interface AudioContext, pour toutes les opérations audios. webkitAudioContext permet le fonctionnement sur Safari.
        await this.std.resume(); //Démarrage du contexte audio

        this.freqechantillonnage = this.std.sampleRate; //Mise à jour de la fréquence d'échantillonnage avec sampleRate, une propriété de AudioContext

        this.comp = this.std.createDynamicsCompressor(); //Création du compresseur 
        this.comp.threshold.setValueAtTime(-18, this.std.currentTime); //Compression des sons élevés (supérieurs à -18dBFS)
        this.comp.knee.setValueAtTime(30, this.std.currentTime); //Compression douce pour éviter les coupures brusques
        this.comp.ratio.setValueAtTime(8, this.std.currentTime); //Ratio 8:1 : Augmentation de 1dB pour chaque 8dB au-dessus du seuil
        this.comp.attack.setValueAtTime(0.003, this.std.currentTime); //Réaction très rapide (0,003s) lorsqu'il y a un pic
        this.comp.release.setValueAtTime(0.25, this.std.currentTime); //Relâche de la compression doucement (0,25s) après un pic 

        this.gain = this.std.createGain(); //Création du noeud de gain (volume global) appliqué aux sons
        this.gain.gain.value = dbToLin(-18); //Gain de -18dBFS par défaut, soit 12% de la puissance globale

        this.analyser = this.std.createAnalyser(); //Création de l'analysateur de son
        this.analyser.fftSize = 2048; //Résolution de la transformée de Fourier

        //Connexions (chaîne de traitement finale)
        this.comp.connect(this.gain); //Signal sortant du compresseur passe par le gain
        this.gain.connect(this.analyser); //Signal sortant du gain passe par l'analysateur
        this.analyser.connect(this.std.destination); //Signal sortant de l'analysateur est envoyé à la sortie audio  
    }

    /**
    *@method setgaindB
    *Méthode qui facilite le changement du gain du signal à l'aide d'une rampe.
    *@param {Number} db, le gain visé (-18 dBFS par défaut)
    */
    setgaindB(db = -18){ 
        if (!this.gain) return;
        this.gain.gain.setTargetAtTime(dbToLin(db), this.std.currentTime, 0.05) //setTargetAtTime permet d'appliquer une rampe exponentielle vers la nouvelle valeur. Un délai de 0,05 secondes est imposée pour adoucir la transition
    }

    /**
    *@method arretSon
    *Méthode qui permet l'arrêt du son en sortie. 
    */
    arretSon(){ 
        if (!this.sonActuel) return; //Si aucun son n'est en cours, on sort directement de la fonction
        if (this.sonActuel.osc){ //Si un son (oscillateur) est en lecture
            const {osc, g} = this.sonActuel;
            try {osc.stop(this.std.currentTime + 0.02); } catch {} //Arrêt de l'oscillateur
            try {g.disconnect(); } catch {} //Arrêt du gain
        } else if (this.sonActuel.type === 'fichier'){ //Si le son en cours vient d'un fichier importé par l'utilisateur
            const {source_audio, source_gain, notch, lowPeak, highPeak} = this.sonActuel;
            //Déconnexion de tous les noeuds de filtrage de la chaîne de traitement (source, gain, et filtres)
            try {source_audio.stop(this.std.currentTime + 0.02); } catch {}
            try {source_gain.disconnect();} catch {}
            try {notch.disconnect();} catch {}
            try {lowPeak.disconnect();} catch {}
            try {highPeak.disconnect();} catch {}
        }

        this.sonActuel = null; //Réinitialisation du son
    }

    // Test de pitch-matching 
    /**
    *@method jouerPitch
    *Méthode qui permet la lecture des tons purs de fréquence, forme d'onde et gain choisis.
    *@param {Number} freq, la fréquence voulue (8000Hz par défaut)
    *@param {String} type, la forme d'onde voulue (sinusoide par défaut)
    *@param {Number} db, le gain (-36 dBFS par défaut)
    */
    jouerPitch(freq = 8000, type = "sine", db = -36){ //Fonction jouant les sons pour le pitch-matching
        this.arretSon(); //Arrêt d'un son avant d'en jouer un nouveau
        const osc = this.std.createOscillator(); //Création de l'oscillateur
        osc.type = type; //Choix de la forme du son

        const g = this.std.createGain(); //Création d'un gain pour le pitch
        g.gain.value = dbToLin(db); //Ajustement du gain

        osc.connect(g); //Connexion de l'oscillateur au gain
        g.connect(this.comp); //Connexion du gain au compresseur
        osc.start(); //Démarrage de l'oscillateur
        this.sonActuel = {osc, g}; //Enregistrement du son actuel pour pouvoir le modifier
        this.defFreq(freq); //Définition de la fréquence du pitch  
    }

    /**
    *@method defFreq
    *Méthode qui permet de changer la fréquence du son joué sans arrêt dans le test de pitch-matching lorsque le curseur est déplacé. 
    *@param {Number} freq, la nouvelle fréquence visée (définie par le curseur).
    */
    defFreq(freq){
        if (!this.sonActuel) return; //Vérification qu'un son est en cours de lecture
        this.sonActuel.osc.frequency.setTargetAtTime(freq, this.std.currentTime, 0.01); //Rampe exponentielle vers la nouvelle fréquence avec un délai de 0,01 secondes.
    }


    /**
    *@method creerSonBlanc
    *Méthode de création d'un bruit blanc. Un bruit blanc correspond à un signal aléatoire comportant toutes les fréquences audibles, pour lesquelles l'énergie est également répartie.
    *@param {Number} dureesec, la durée en secondes du buffer créé (dureesec = 60s par défaut), qui pourra être joué en boucle.
    *@returns {AudioBufferSourceNode}, le noeud source contenant le bruit blanc. 
    */
    creerSonBlanc(dureesec = 60) { //Génération d'un son blanc (qui recommence en boucle)
        const echantillons = Math.floor(this.std.sampleRate * dureesec); //Calcul du nombre d'échantillons à générer en fonction de la fréquence d'échantillonnage et de la durée en secondes
        const buffer = this.std.createBuffer(1, echantillons, this.std.sampleRate); //Création du buffer 
        const data = buffer.getChannelData(0);
        for (let i = 0; i < echantillons; i++) data[i] = (Math.random()*2-1)*0.35; //Génération d'une séquence de valeurs aléatoires entre -0,35 et 0,35 (35% de l'amplitude maximale pour la sécurité)
        const src = this.std.createBufferSource(); //Création de la source audio qui lit le buffer
        src.buffer = buffer;
        src.loop = true; //Permet la lecture en continu (boucle)
        return src;
    } 

    /**
    *@method transitionGain
    *Méthode qui permet de couper doucement le gain à la fin des sons pour éviter une coupure brusque. 
    *@param {Number} targetdB, la valeur de gain visée (-60 dBFS par défaut).
    *@param {Number} dureetrans, la valeur de durée de transition en secondes voulue (0,4 secondes par défaut). 
    */
    transitionGain(targetdB = -60, dureetrans = 0.4) { //Transition à la fin des sons pour éviter une coupure brusque
        const t0 = this.std.currentTime; //Moment de début de la transition
        const t1 = t0 + dureetrans; //Moment de fin de la transition
        
        this.gain.gain.cancelScheduledValues(t0); //Suppression des changements de volume déjà programmés
        this.gain.gain.setValueAtTime(this.gain.gain.value, t0); //Démarrage de la rampe à la valeur actuelle du gain
        this.gain.gain.linearRampToValueAtTime(dbToLin(targetdB), t1); //Application d'une rampe linéaire jusqu'à la valeur visée
        }

    /**
    *@method creerSourceTherapie
    *Méthode qui permet de créer une source audio selon le type de son choisi par l'utilisateur pour le TMNMT:
    *Les types de son possibles sont un bruit blanc (type === "white"), un bruit rose (type === "pink), ou une fonction sinusoidale/carrée/triangle/en dents de scie (type === "sine"/"square"/"triangle"/"sawtooth").
    *Un bruit rose correspond à un bruit blanc pour lequel les très hautes fréquences sont coupées, et l'amplitude des basses fréquences est augmentée. 
    *@param {String} type, le type de son choisi par l'utilisateur (type = "white", un bruit blanc, par défaut)
    *@return {{node: GainNode}, {stopAll: function}}, le noeud de sortie (mix) et une fonction de nottoyage des chaînes de traitement audio. 
    */
    creerSourceTherapie(type = "white"){ 
        const mix = this.std.createGain(); //Création du noeud de sortie (gain)
        mix.gain.value = 1.0; //Gain de 1 par défaut (valeur maximale, sera diminuée lors du passage dans le compresseur)

        const stops = []; //Permet d'arrêter tous les oscillateurs au cas où il y en a plusieurs (tableau qui accumule les arrêts)
        
        const connexions = (node) => { //Fonction de connexion d'un noeud (buffer, oscillateur, filtre) à la chaîne de traîtement
            node.connect(mix); //connexion du noeud à la sortie
            if (typeof node.start === "function"){ //Si le noeud nécessite un démarrage (oscillateur ou buffer)
                try {node.start();} catch {} //Démarrage du noeud 
            }
            stops.push(()=> { //Déconnexions si un arrêt est demandé
                try {node.stop();} catch {} //Arrêt de la source 
                try{node.disconnect();} catch {} //Déceonnection du noeud
            });
        }; 

        if (type === "white"){ //Si un bruit blanc est sélectionné 
            const src = this.creerSonBlanc(60); //Création d'un buffer avec la méthode dédiée
            connexions(src); //connexion du buffer à la sortie audio avec la fonction connexions
            
        } else if (type === "pink"){ //Si un bruit rose est sélectionné
            const src = this.creerSonBlanc(60); //Création d'un buffer de son blanc avec la méthode dédiée
            
            const lowshelf = this.std.createBiquadFilter(); //Création d'un filtre
            lowshelf.type = "lowshelf"; //Filtre lowshelf pour intensifier uniquement les basses fréquences
            lowshelf.frequency.value = 500; //Fréquence de coupure à 500Hz
            lowshelf.gain.value = +6; //Augmentation de 6dB des fréquences en-dessous de la fréquence de coupure

            const passeBas = this.std.createBiquadFilter(); //Création d'un second filtre
            passeBas.type = "lowpass"; //Filtre passe-bas (lowpass) pour couper les très hautes fréquences
            passeBas.frequency.value = 6000; //Fréquence de coupure à 6000Hz
            passeBas.Q.value = 0.7; //Facteur de qualité Q de 0,7 (standard)

            src.connect(lowshelf); //connexion du buffer au filtre lowshelf
            lowshelf.connect(passeBas); //connexion de la source filtrée au filtre passe-bas
            passeBas.connect(mix); //connexion de la source doublement filtrée à la sortie
            try {src.start();} catch{} //Démarrage de la source
            stops.push(() => { //Déconnexion de la chaîne de traitement audio en cas d'arrêt
                try {src.stop();} catch {}
                try {src.disconnect();} catch {}
                try {filt.disconnect();} catch {}
                try {passeBas.disconnect();} catch {}
            });
            
        } else { //Si un son sinusoidal, carré, triangle ou en dents de scie est sélectionné, des oscillateurs de cette forme à différentes fréquences sont démarrés.
            const freqs = [200, 400, 800, 1600, 3200, 6400, 9600, 12000, 24000]; //Liste des fréquences à utiliser
            for (const f of freqs){ //Pour chaque fréquence
                const osc = this.std.createOscillator(); //Création d'un oscillateur
                const gain = this.std.createGain(); //Création d'un gain pour chaque oscillateur 
                osc.type = type; //Définition du type de l'oscillateur (forme de l'onde)
                osc.frequency.value = f*(1+(Math.random()-0.5)*0.08); //Désynchronisation des fréquences pour éviter les battements statiques
                gain.gain.value = 1.0 / freqs.length; //Normalisation du volume (division par le nombre d'oscillateurs)
                osc.connect(gain); //Connexion de l'oscillateur et du gain
                gain.connect(mix); //Connexion du gain à la sortie
                try {osc.start();} catch {} //Démarrage de l'oscillateure
                stops.push(() => { //En cas d'arrêt, déconnexion de la chaîne de traitement
                    try {osc.stop(); } catch {}
                    try {gain.disconnect();} catch {}
                });
            }
        }

        return {node : mix, stopAll : () => {stops.forEach(fn => {try {fn();} catch {}});}}; 
    }

    //MWT
    /** 
    *@method ChaineMWT
    *Méthode qui permet la génération d'un signal audio sinusoidal modulé en fonction du protocole de la thérapie par sons modulés.
    *@param {Number} fc, la fréquence porteuse, qui correspond à la fréquence des acouphènes de l'utilisateur.
    *@param {Number} ca, l'amplitude de la fréquence porteuse (ca = 1 par défaut)
    *@param {Number} fm, la fréquence de modulation (fm = 10Hz par défaut)
    *@param {Number} m, la profondeur de modulation (m = 1 par défaut)
    *@param {Number} p la phase (p = 0 par défaut)
    *@returns {{node : GainNode}, {stopAll : function}}, le noeud de sortie final (signal sinusoidal modulé) et une fonction de nettoyage de la chaîne de traîtement audio.
    */
    ChaineMWT(fc, ca = 1, fm = 10, m = 1, p = 0){
        const porteuse = this.std.createOscillator(); //Création de l'oscillateur pour la fréquence porteuse
        porteuse.type = "sine"; //Signal sinusoidal (toujours pour MWT)
        porteuse.frequency.value = fc; //Fréquence porteuse
        const gainPorteuse = this.std.createGain(); //Création du gain pour l'oscillateur à la fréquence porteuse
        gainPorteuse.gain.value = ca; //Gain de l'oscillateur (amplitude ca)
        porteuse.connect(gainPorteuse); //Connexion du gain et de l'oscillateur

        const modulateur = this.std.createOscillator(); //Création de l'oscillateur pour la fréquence de modulation
        
        {//Création d'une fonction cos(2*pi*fm*t + p) = cos(p)cos(2*pi*fm*t) - sin(p)sin(2*pi*fm*t) avec PeriodicWave afin de pouvoir intégrer la phase 
        //On note que PeriodicWave est utilisée car l'oscillateur standard ne permet pas de définir de phase. 
            const reel = new Float32Array(2); //Stockage des coefficients pour l'onde
            const imag = new Float32Array(2);
            reel[1] = Math.cos(p);
            imag[1] = -Math.sin(p);
            const pw = this.std.createPeriodicWave(reel, imag, {disableNormalization:true}); //Création de l'onde
            modulateur.setPeriodicWave(pw); //Connexion de l'onde personnalisée avec phase à l'oscillateur de modulation
            modulateur.frequency.value = fm; //Définition de la fréquence de modulation
        }

        const profondeur = this.std.createGain(); //Définition de la profondeur de l'oscillateur de modulation (gain)
        profondeur.gain.value = m; 
        modulateur.connect(profondeur); //Connexion du gain et de l'oscillateur 

        const multiplication = this.std.createGain(); //Noeud final (multiplication des deux oscillateurs)
        multiplication.gain.value = 0; //Initalisation à 0
        profondeur.connect(multiplication.gain); //Connexion du gain de modulation (profondeur de modulation) au gain principal (multiplication)
        gainPorteuse.connect(multiplication); //Connexion du gain de la fréquence porteuse au gain principal 

        //Démarrage des deux oscillateurs
        modulateur.start();
        porteuse.start();

        return {
            node:multiplication, //Noeud de sortie 
            stopAll:() => { //Déconnxion de toute la chaîne en cas d'arrêt
                try {porteuse.stop(); } catch {}
                try {modulateur.stop();} catch {}
                try {porteuse.disconnect();} catch {}
                try {gainPorteuse.disconnect();} catch {}
                try {modulateur.disconnect();} catch {}
                try {profondeur.disconnect();} catch {}
                try {multiplication.disconnect();} catch {}
            }
        };
    }

    // TMNMT
    /**
    *@method ChaineTMNMT
    *Méthode qui permet la modification d'un signal (sinusoidal, carré, triangulaire ou en dents de scie) en fonction du protocole de la thérapie
    *musicale personnalisée avec suppression de bande fréquentielle. 
    *@param {AudioNode} src, le signal sinusoidal source à moduler.
    *@param {Number} f_ac, la fréquence des acouphènes de l'utilisateur. 
    *@returns {{notch: BiquadFilterNode}, {lowPeak: BiquadFilterNode}, {highPeak: BiquadFilterNode}}, les noeuds contenant les filtres de traîtement (pour permettre le nettoyage de la chaine par la suite) 
    */
    ChaineTMNMT(src, f_ac){
        //Retrait d'1/2 octave autour de la fréquence de l'acouphène (1/4 d'octaves de chaque côté)
        const notchLow = f_ac * Math.pow(2, -0.25);
        const notchHigh = f_ac * Math.pow(2, 0.25);
        const notch = this.std.createBiquadFilter();
        notch.type = "notch";
        notch.frequency.value = f_ac;
        notch.Q.value = f_ac / (notchHigh - notchLow); //Facteur de qualité de la largeur d'un demi-octave
        
        //Augmentation de 20dB des fréquences de 3/8 d'octaves de chaque côté de f_ac
        const lowPeak = this.std.createBiquadFilter();
        lowPeak.type = "peaking"; //Utilisation d'un filtre en pic pour les fréquences en-dessous de f_ac
        lowPeak.frequency.value = f_ac*Math.pow(2, (-3/8)); 
        lowPeak.Q.value = 1.0;
        lowPeak.gain.value = 20; //Les valeurs de gains des filtres BiquadFilterNode sont en décibels
        const highPeak = this.std.createBiquadFilter();
        highPeak.type = "peaking"; //Utilisation d'un filtre en pic pour les fréquences au-dessus de f_ac
        highPeak.frequency.value = f_ac*Math.pow(2, (+3/8));
        highPeak.Q.value = 1.0;
        highPeak.gain.value = 20;
        
        //Application des opérations et connexion de la chaîne de traitement audio
        src.connect(notch);
        notch.connect(lowPeak);
        lowPeak.connect(highPeak);
        highPeak.connect(this.comp); 
        
        return {notch, lowPeak, highPeak}; //Retour des filtres (pour deconnexion/nettoyage par la suite)
    }
    
    // Utilisation d'un fichier audio déposé par l'utilisateur
    /**
    *@method ChaineTMNMT_Audio 
    *Méthode qui permet la modification du signal d'un fichier audio déposé par l'utilisateur en fonction du protocole de la thérapie
    *musicale personnalisée avec suppression de bande fréquentielle. Cette fonction permet uniquement de modifier le fichier mais n'inclus pas sa récupération et son décodage.
    *@param {AudioNode} src, le fichier audio source importé.
    *@param {Number} f_ac, la fréquence des acouphènes de l'utilisateur.
    *@returns {{notch: BiquadFilterNode}, {lowPeak: BiquadFilterNode}, {highPeak: BiquadFilterNode}}, les noeuds contenant les filtres de traîtement (pour permettre le nettoyage de la chaine par la suite) 
    */
    async ChaineTMNMT_Audio(src, f_ac){
        // Dans le cas d'un fichier audio importé, l'égalisation du spectre (méthode dédiée à cet effet) est nécessaire. 
        const {node:audio_egalise, stop: stopBoucleEgalisation} = await this.egalisationSpectre(src, f_ac);

        //Retrait d'1/2 octave autour de la fréquence de l'acouphène
        const notchLow = f_ac * Math.pow(2, -0.25);
        const notchHigh = f_ac * Math.pow(2, 0.25);
        const notch = this.std.createBiquadFilter();
        notch.type = "notch";
        notch.frequency.value = f_ac;
        notch.Q.value = f_ac / (notchHigh - notchLow); //Facteur de qualité de la largeur d'un demi-octave

        //Augmentation de 20dB des fréquences de 3/8 d'octaves de chaque côté de f_ac
        const lowPeak = this.std.createBiquadFilter();
        lowPeak.type = "peaking";
        lowPeak.frequency.value = f_ac*Math.pow(2, (-3/8));
        lowPeak.Q.value = 1.0;
        lowPeak.gain.value = 20;
        const highPeak = this.std.createBiquadFilter();
        highPeak.type = "peaking";
        highPeak.frequency.value = f_ac*Math.pow(2, (+3/8));
        highPeak.Q.value = 1.0;
        highPeak.gain.value = 20;

        //Application des opérations et connexion de la chaîne de traitement audio
        audio_egalise.connect(notch);
        notch.connect(lowPeak);
        lowPeak.connect(highPeak);
        highPeak.connect(this.comp);
        
        return {notch, lowPeak, highPeak, stopBoucleEgalisation};
    }

    /**
    *@method egalisationSpectre
    *Méthode qui permet l'égalisation du spectre d'un fichier audio.
    *@param {AudioNode} src_, le fichier audio source dont il faut égaliser le spectre.
    *@param {Number} f_ac, la fréquence des acouphènes de l'utilisateur.
    *@returns {{node: GainNode}, {stop: function}}, le noeud de gain correspondant au fichier audio après égalisation, et une fonction qui permet l'arrêt de la boucle et le nottoyage.
    */
    async egalisationSpectre(src_, f_ac) {
        const sortie = this.std.createGain();
        
        //Filtre passe-bande pour les fréquences basses
        const passebas = this.std.createBiquadFilter(); 
        passebas.type = "bandpass";
        passebas.frequency.value = f_ac*0.75;
        passebas.Q.value = 1.0;

        //Filtre passe-bande pour les fréquences hautes
        const passehaut = this.std.createBiquadFilter();
        passehaut.type = "bandpass";
        passehaut.frequency.value = f_ac*1.5;
        passehaut.Q.value = 1.0;

        //Gains pour chaque bande (à ajuster pour égaliser le spectre)
        const gainbas = this.std.createGain();
        gainbas.gain.value = 1.0;
        const gainhaut = this.std.createGain();
        gainhaut.gain.value = 1.0;

        //Analyseurs des bandes de fréquences pour déterminer comment ajuster le gain
        const analyserbas = this.std.createAnalyser(); 
        const analyserhaut = this.std.createAnalyser(); 
        analyserbas.fftSize = analyserhaut.fftSize = 512;

        //Connexion de la source (fichier audio) > filtres > gains > analyseur > sortie
        src_.connect(passebas);
        passebas.connect(gainbas);
        gainbas.connect(analyserbas);
        analyserbas.connect(sortie);
        src_.connect(passehaut);
        passehaut.connect(gainhaut);
        gainhaut.connect(analyserhaut);
        analyserhaut.connect(sortie);

        //Mesure de l'énergie - RMS audio (volume d'une bande de fréquences) pour trouver la bande avec la plus haute puissance
        const bufbas = new Float32Array(analyserbas.fftSize); //Tableaux de valeurs vides
        const bufhaut = new Float32Array(analyserhaut.fftSize);
        
        const rms = (buf) =>{ 
            let s = 0;
            for (let i=0; i<buf.length; i++){
                s += buf[i] * buf[i]; //Pour chaque échantillon audio : calcul de son carré pour obtenir une valeur positive
            }
            return Math.sqrt(s/buf.length); //Calcul de la racine carré 
        };
        //Analyse et correction des gains avec une boucle continue
        let id;
        const boucle = () => {
            analyserbas.getFloatTimeDomainData(bufbas);
            analyserhaut.getFloatTimeDomainData(bufhaut);
            
            const rmsbas = rms(bufbas);
            const rmshaut = rms(bufhaut);
            const diff = rmsbas - rmshaut;

            //Ajustement des gains pour que les deux bandes aient la même intensité
            gainbas.gain.value = 1 - 0.5*diff;
            gainhaut.gain.value = 1 + 0.5*diff;

            id = requestAnimationFrame(boucle); //Relance de la boucle en continu (60 fois par secondes)
        };
        boucle();

        return {
            node: sortie,
            stop: () => {
                cancelAnimationFrame(id); //Arrêt de la boucle
                try { //Nettoyage de la chaîne de traitement
                    analyserbas.disconnect();
                    analyserhaut.disconnect();
                    passebas.disconnect();
                    passehaut.disconnect();
                    gainbas.disconnect();
                    gainhaut.disconnect();
                } catch (e) {}
            }
        }; 
    }


    /**
    *@method ModulerAudio 
    *Méthode qui permet de récupérer un fichier audio importé, de la décoder, puis d'y appliquer le protocole TMNMT.
    *@param {File} fichier_source, le fichier audio importé par l'utilisateur.
    *@param {Number} f_ac, la fréquence des acouphènes de l'utilisateur.
    *@returns {AudioBuffer} Le buffer décodé du fichier audio après modulation. 
    */
    async ModulerAudio(fichier_source, f_ac){
        this.arretSon(); //Arrêt des sons en cours
        if (!this.std){await this.init();} //Vérification que l'audioContext est prêt

        // Récupération du fichier audio source déposé (forme brut)
        const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(fichier_source);
        });

        // Décodage du array buffer qui contient le fichier audio 
        const buffer = await this.std.decodeAudioData(arrayBuffer).catch(error => {console.error("Erreur", error); throw error});
        
        // Lecture du son (lecture des données du buffer)
        const source_audio = this.std.createBufferSource();
        source_audio.buffer = buffer;
        source_audio.loop = true;
        
        // Gain
        const source_gain = this.std.createGain();
        source_gain.gain.value = 1;
        source_audio.connect(source_gain);

        const {notch, lowPeak, highPeak, stopBoucleEgalisation} = await this.ChaineTMNMT_Audio(source_gain, f_ac);

        this.sonActuel = {type:'fichier', source_audio: source_audio, source_gain: source_gain, notch: notch, lowPeak: lowPeak, highPeak: highPeak, stopBoucleEgalisation: stopBoucleEgalisation};
        source_audio.start(0);

        if (!source_audio.loop){source_audio.onended = () => {this.arretSon();};}

        return buffer;
    }
}






