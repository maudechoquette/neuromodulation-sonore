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
        this.std = new AudioContext(); //Création du contexte audio ("studio") grâce à l'interface AudioContext, pour toutes les opérations audios
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

    // Test de pitch-matching 
    /**
    *@method jouerPitch
    *Méthode qui permet la lecture des tons purs de fréquence, forme d'onde et gain choisis.
    *@param {Number} freq, la fréquence voulue (8000Hz par défaut)
    *@param {String} type, la forme d'onde voulue (sinusoide par défaut)
    *@param {Number] db, le gain (-36 dBFS par défaut)
    */
    jouerPitch(freq = 8000, type = "sine", db = -36){ //Fonction jouant les sons pour le pitch-matching
        this.arretSon(); //Arrêt d'un son avant d'en jouer un nouveau
        const osc = this.std.createOscillator(); //Création de l'oscillateur
        osc.type = type; //Choix de la forme du son

        const g = this.std.createGain(); //Création d'un gain pour le pitch
        g.gain.value = dbToLin(db); //Ajustement du gain

        osc.connect(g); //Connection de l'oscillateur au gain
        g.connect(this.comp); //Connection du gain au compresseur
        osc.start(); //Démarrage de l'oscillateur
        this.sonActuel = {osc, g}; //Enregistrement du son actuel pour pouvoir le modifier
        this.defFreq(freq); //Définition de la fréquence du pitch  
    }

    defFreq(freq){
        if (!this.sonActuel) return;
        this.sonActuel.osc.frequency.setTargetAtTime(freq, this.std.currentTime, 0.01);
    }

    arretSon(){ //Fonction d'arrêt du son
        if (!this.sonActuel) return; 
        if (this.sonActuel.osc){ //Si on est en oscillateur
            const {osc, g} = this.sonActuel;
            try {osc.stop(this.std.currentTime + 0.02); } catch {} //Arrêt de l'oscillateur
            try {g.disconnect(); } catch {} //Débranchement du gain
        } else if (this.sonActuel.type === 'fichier'){
            const {source_audio, source_gain, notch, lowPeak, highPeak} = this.sonActuel;
            try {source_audio.stop(this.std.currentTime + 0.02); } catch {}
            try {source_gain.disconnect();} catch {}
            try {notch.disconnect();} catch {}
            try {lowPeak.disconnect();} catch {}
            try {highPeak.disconnect();} catch {}
        }

        this.sonActuel = null; //Remise à 0 du son
    }

    creerSonBlanc(dureesec = 60) { //Génération d'un son blanc (qui recommence en boucle)
        const echantillons = Math.floor(this.std.sampleRate * dureesec); //Calcul du nombre d'échantillons à générer
        const buffer = this.std.createBuffer(1, echantillons, this.std.sampleRate); //Création du buffer 
        const d = buffer.getChannelData(0);
        for (let i = 0; i < echantillons; i++) d[i] = (Math.random()*2-1)*0.35; //Génération d'une séquence de valeurs aléatoires entre -1 et 1
        const src = this.std.createBufferSource(); //Création de la source audio qui lit le buffer
        src.buffer = buffer;
        src.loop = true;
        return src;
    } //À revoir

    transitionGain(targetDb = -60, dureetrans = 0.4) { //Transition à la fin des sons pour éviter une coupure brusque
        const t0 = this.std.currentTime;
        const t1 = t0 + dureetrans;
        this.gain.gain.cancelScheduledValues(t0); //Supprimes les changements de volume déjà programmés
        this.gain.gain.setValueAtTime(this.gain.gain.value, t0);
        this.gain.gain.linearRampToValueAtTime(Math.pow(10, targetDb/20), t1);
        }

    //Création d'une source audio selon le type choisi par l'utilisateur
    creerSourceTherapie(type = "white"){ 
        const mix = this.std.createGain(); //Création du noeud de gain
        mix.gain.value = 1.0;

        const stops = []; //Permet d'arrêter tous les oscillateurs au cas où il y en a plusieurs
        const connexions = (node) => {
            node.connect(mix);
            if (typeof node.start === "function"){
                try {node.start();} catch {}
            }
            stops.push(()=> {
                try {node.stop();} catch {}
                try{node.disconnect();} catch {}
            });
        }; 

        if (type === "white"){
            const src = this.creerSonBlanc(60);
            connexions(src);
        } else if (type === "pink"){
            const src = this.creerSonBlanc(60);
            const filt = this.std.createBiquadFilter();
            filt.type = "lowshelf"; //Filtre shelf pour intensifier uniquement les basses fréquences
            filt.frequency.value = 500;
            filt.gain.value = +6; //Augmentation de 6dB des fréquences en-dessous de 500Hz

            const passeBas = this.std.createBiquadFilter();
            passeBas.type = "lowpass";
            passeBas.frequency.value = 6000; //Coupure des fréquences supérieures à 6000Hz
            passeBas.Q.value = 0.7;

            src.connect(filt);
            filt.connect(passeBas);
            passeBas.connect(mix);
            try {src.start();} catch{}
            stops.push(() => {
                try {src.stop();} catch {}
                try {src.disconnect();} catch {}
                try {filt.disconnect();} catch {}
                try {passeBas.disconnect();} catch {}
            });
        } else {
            const freqs = [200, 400, 800, 1600, 3200, 6400, 9600, 12000, 24000];
            for (const f of freqs){
                const osc = this.std.createOscillator();
                const gain = this.std.createGain();
                osc.type = type;
                osc.frequency.value = f*(1+(Math.random()-0.5)*0.08); //Désynchronisation pour éviter les battements statiques
                gain.gain.value = 1.0 / freqs.length; //Normalisation du volume
                osc.connect(gain);
                gain.connect(mix);
                try {osc.start();} catch {}
                stops.push(() => {
                    try {osc.stop(); } catch {}
                    try {gain.disconnect();} catch {}
                });
            }
        }

        return {
            node : mix,
            stopAll : () => {stops.forEach(fn => {try {fn();} catch {}});}
        };
    }

    //MWT
    ChaineMWT(fc, ca = 1, fm = 10, m = 1, p = 0){
        //On a fc la fréquence porteuse, ca l'amplitude de la fréquence porteuse, fm la fréquence de modulation, m la profondeur de modulation et p la phase
        const porteuse = this.std.createOscillator();
        porteuse.type = "sine";
        porteuse.frequency.value = fc;

        const gainPorteuse = this.std.createGain();
        gainPorteuse.gain.value = ca;
        porteuse.connect(gainPorteuse);

        const modulateur = this.std.createOscillator();
        { //Création d'une fonction cos(2*pi*fm*t + p) = cos(p)cos(2*pi*fm*t) - sin(p)sin(2*pi*fm*t) avec PeriodicWave
            const reel = new Float32Array(2);
            const imag = new Float32Array(2);
            reel[1] = Math.cos(p);
            imag[1] = -Math.sin(p);
            const pw = this.std.createPeriodicWave(reel, imag, {disableNormalization:true});
            modulateur.setPeriodicWave(pw);
            modulateur.frequency.value = fm;
        }

        const profondeur = this.std.createGain();
        profondeur.gain.value = m;
        modulateur.connect(profondeur);

        const multiplication = this.std.createGain();
        multiplication.gain.value = 0;
        profondeur.connect(multiplication.gain);
        gainPorteuse.connect(multiplication);

        modulateur.start();
        porteuse.start();

        return {
            node:multiplication,
            stopAll:() => {
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

    // Utilisation d'un fichier audio déposé par l'utilisateur
    
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

        const {notch, lowPeak, highPeak} = await this.ChaineTMNMT_Audio(source_gain, f_ac);
        //highPeak.connect(this.comp); //Connection au compresseur

        this.sonActuel = {type:'fichier', source_audio: source_audio, source_gain: source_gain, notch: notch, lowPeak: lowPeak, highPeak: highPeak};

        source_audio.start(0);

        if (!source_audio.loop){source_audio.onended = () => {this.arretSon();};}

        return buffer;
    }

    ChaineTMNMT(src, f_ac){
        //Retrait d'1/2 octave autour de la fréquence de l'acouphène
        const notch = this.std.createBiquadFilter();
        notch.type = "notch";
        notch.frequency.value = f_ac;
        notch.Q.value = 1.4; //Largeur d'un demi-octave
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
        //Application des opérations
        src.connect(notch);
        notch.connect(lowPeak);
        lowPeak.connect(highPeak);
        highPeak.connect(this.comp); //Connection au compresseur
        return {notch, lowPeak, highPeak};
    }

    async ChaineTMNMT_Audio(src, f_ac){
        // Égalisation du spectre
        const audio_egalise = await this.egalisationSpectre(src, f_ac);

        //Retrait d'1/2 octave autour de la fréquence de l'acouphène
        const notch = this.std.createBiquadFilter();
        notch.type = "notch";
        notch.frequency.value = f_ac;
        notch.Q.value = 1.4; //Largeur d'un demi-octave

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

        //Application des opérations
        audio_egalise.connect(notch);
        notch.connect(lowPeak);
        lowPeak.connect(highPeak);
        highPeak.connect(this.comp); //Connection au compresseur
        return {notch, lowPeak, highPeak};
    }


    async egalisationSpectre(src_, f_ac) {
        const sortie = this.std.createGain();
        
        //Filtre passe-bande de fréquences basses
        const passebas = this.std.createBiquadFilter(); 
        passebas.type = "bandpass";
        passebas.frequency.value = f_ac*0.75;
        passebas.Q.value = 1.0;

        //Filtre passe-bande de fréquences hautes
        const passehaut = this.std.createBiquadFilter();
        passehaut.type = "bandpass";
        passehaut.frequency.value = f_ac*1.5;
        passehaut.Q.value = 1.0;

        //Gains pour chaque bande (à ajuster pour égaliser le spectre)
        const gainbas = this.std.createGain();
        gainbas.gain.value = 1.0;
        const gainhaut = this.std.createGain();
        gainhaut.gain.value = 1.0;

        //Analysateurs des bandes de fréquences
        const analyserbas = this.std.createAnalyser(); 
        const analyserhaut = this.std.createAnalyser(); 
        analyserbas.fftSize = analyserhaut.fftSize = 512;

        //Connection de la source (fichier audio) > filtres > gains > analyse > sortie
        src_.connect(passebas);
        passebas.connect(gainbas);
        gainbas.connect(analyserbas);
        analyserbas.connect(sortie);

        src_.connect(passehaut);
        passehaut.connect(gainhaut);
        gainhaut.connect(analyserhaut);
        analyserhaut.connect(sortie);

        //Mesure de l'énergie - RMS audio 
        const bufbas = new Float32Array(analyserbas.fftSize);
        const bufhaut = new Float32Array(analyserhaut.fftSize);
        
        const rms = (buf) =>{ //calcul de la RMS (volume d'une bande de fréquences)
            let s = 0;
            for (let i=0; i<buf.length; i++){
                s += buf[i] * buf[i]; //Pour chaque échantillon audio : calcul de son carré pour obtenir une valeur positive
            }
            return Math.sqrt(s/buf.length); //Calcul de la racine carré 
        };
        
        //Analyse et correction des gains avec un boucle continue
        const boucle = () => {
            analyserbas.getFloatTimeDomainData(bufbas);
            analyserhaut.getFloatTimeDomainData(bufhaut);

            const rmsbas = rms(bufbas);
            const rmshaut = rms(bufhaut);
            const diff = rmsbas - rmshaut;

            //Ajustement des gains pour que les deux bandes aient la même intensité
            gainbas.gain.value = 1 - 0.5*diff;
            gainhaut.gain.value = 1 + 0.5*diff;

            requestAnimationFrame(boucle); //Relance de la boucle en continu (60 fois par secondes)
        };
        boucle();

        return sortie;
    }
}



