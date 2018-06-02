/**
 * NPM Module dependencies.
 */
const express = require('express');
const multer = require('multer');

const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

const port = 4300;

/**
 * NodeJS Module dependencies.
 */
const { Readable } = require('stream');

/**
 * Create Express server && Express Router configuration.
 */
const app = express();

/**
 * Dichiarazione e bind dei trackRoutes
 */
const trackRoute = express.Router();
const fileRoute = express.Router();
const root = express.Router();
app.use(express.static('public'));
app.use('/tracks', trackRoute);
app.use('/files', fileRoute);
app.use('/', root);

/**
 * Connect Mongo Driver to MongoDB.
 * Database Name: trackDB
 */
let db;
MongoClient.connect('mongodb://localhost:27017/trackDB', (err, database) => {
    if (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
        process.exit(1);
    }
    db = database;
});

/**
 * GET /tracks/:trackID
 * express effettua automaticamente il binding dalla sezione :trackID
 * dell'URL alla variabile req.params.trackID della callback
 * Effettua il cast la stringa req.params.trackID ad un oggetto mongoDB ObjectID
 * Questo perche' openDownloadStream usa un oggetto di tipo ObjectID
 */
trackRoute.get('/:trackID', (req, res) => {
    try {
        var trackID = new ObjectID(req.params.trackID);
    } catch(err) {
        return res.status(400).json({ message: "Invalid trackID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters" });
    }

    /**
     * Queste info servono al browser per maneggiare la response.
     */
    res.set('content-type', 'audio/mp3');
    res.set('accept-ranges', 'bytes');

    /**
     * Crea variabile bucket e la inizializza con un'instanza di GridFSBucket dal
     * modulo mongodb, in ingresso prende la var db creata prima e un letterale
     * che dichiara il nome del bucket da cui vogliamo leggere.
     * In questo caso il bucket si chiama 'tracks'
     */
    let bucket = new mongodb.GridFSBucket(db, {
        bucketName: 'tracks'
    });

    /**
     * Fornisce un readable stream da GridFS. Per readable leggi readable stream
     * nella NodeJS stream API
     */
    let downloadStream = bucket.openDownloadStream(trackID);

    /**
     * Lo stream emette dei NodeJS Event, esistono 5 tipi di eventi
     * close, data, end, error, readable, a noi interessano solo i 3 centrali.
     * Listener data event
     */
    downloadStream.on('data', (chunk) => {
        res.write(chunk);
    });

    /**
     * Listener error event
     * @todo serve aggiungere un messaggio piu' dettagliato
     */
    downloadStream.on('error', () => {
        res.sendStatus(404);
    });

    /**
     * Listener end event
     */
    downloadStream.on('end', () => {
        res.end();
    });

});

/**
 * GET lista file su /files
 */
fileRoute.get('/', (req, res) => {
    try {
        db.collection("tracks.files").find().toArray(function(err, result) {
            //console.log('Risultato files: ' + result.length);

            var response = new Array();
            var i=0;

            for(i; i<result.length; i++){
                response.push({
                    _id:result[i]._id,
                    filename:result[i].filename,
                    uploadDate:result[i].uploadDate
                });
            }

            //console.log(response);
            res.json(response);
        });
    } catch(err) {
        return res.status(400).json({ message: "Invalid trackName in URL parameter." });
    }

});

/**
 * GET bacheca su root
 */
root.get('/', (req, res) => {
    try {
        res.sendFile(__dirname + '/index.html');
    } catch(err) {
        return res.status(400).json({ message: "Invalid trackName in URL parameter." });
    }

});

/**
 * POST /tracks
 * allo stesso modo della GET, ma non facciamo il bind di trackID dall'URL.
 * Express non supporta richieste POST di tipo multipart/formdata, quindi usiamo
 * multer per gestire le richieste.
 */
trackRoute.post('/', (req, res) => {

    /*indica a multer si salvare il file uppato in un buffer e non su FS*/
    const storage = multer.memoryStorage()
    const upload = multer({ storage: storage, limits: { fields: 1, fileSize: 20000000, files: 1, parts: 2 }});

    /*accetta un singolo file con nome 'track'*/
    upload.single('track')(req, res, (err) => {
    if (err) {
        return res.status(400).json({ message: "Upload Request Validation Failed" });
	} 
	
	/*nome della traccia audio*/
	var titolo = JSON.stringify(req.file.originalname);
	let trackName = titolo.split(".mp3")[0];
	trackName = trackName.slice(1);
	
    /*converti l'oggetto buffer di multer in un readable stream per inviarlo a GridFS*/
    const readableTrackStream = new Readable();

    /*push del buffer nello stream*/
    readableTrackStream.push(req.file.buffer);

    /*fine dello stream*/
    readableTrackStream.push(null);

    /*inizializza il GridFSBucket*/
    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    });

    /*ottieni un writable stream e associalo ad una variabile*/
    let uploadStream = bucket.openUploadStream(trackName);
    let id = uploadStream.id;

    /*push dei dati dal readableTrackStream al writable stream*/
    readableTrackStream.pipe(uploadStream);

    /**
     * Listener error event
     */
    uploadStream.on('error', () => {
      return res.status(500).json({ message: "Error uploading file" });
    });

    /**
     * Listener finish event
     */
    uploadStream.on('finish', () => {
      return res.status(201).json({ message: "File uploaded successfully, stored under Mongo ObjectID: " + id });
    });
  });
});

app.listen(port, () => {
  console.log("App listening on port " + port);
});
