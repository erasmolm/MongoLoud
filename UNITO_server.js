/**
 * NPM Module dependencies.
 */
const express = require('express');
const multer = require('multer');
const music = require('musicmatch')({ apikey: "bbb76a902fc3b440bb895445f9940fbc" });
const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const icy = require("icy");

const serverPort = 4300;
const chatPort = 4301;
let url = "http://localhost:8000/stazione1";

/**
 * NodeJS Module dependencies.
 */
const { Readable } = require('stream');

/**
 * Create Express server
 */
const app = express();
const chatServer = express();

/**
 * Dichiarazione e bind dei trackRoutes
 */
const textRoute = express.Router();
const trackRoute = express.Router();
const fileRoute = express.Router();
app.use(express.static('public'));
app.use('/testo', textRoute);
app.use('/tracks', trackRoute);
app.use('/files', fileRoute);

//definisco l'array che contiene gli usernames degli utenti che si uniscono alla chat
var usernames1 = {};
var usernames2 = {};
var usernames3 = {};

var artista;
var canzone;

//definisco l'array contenente le rooms disponibili
var rooms = ['stazione1', 'stazione2', 'stazione3'];

//inizializzo il server @TODO
var http = require('http').Server(chatServer);
var io = require('socket.io')(http);

//metto in ascolto il server chat sulla porta chatPort
http.listen(chatPort, function () {
	console.log("Chat server listening on port " + chatPort);
});

//metto in ascolto mongoloud sulla porta serverPort
app.listen(serverPort, () => {
	console.log("Mongo server listening on port " + serverPort);
});

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
 * GET metadata da Icy e testo da musicmatch
 * su /testo
 */
textRoute.get('/', function (req, res) {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream'
		, 'Cache-Control': 'no-cache'
		, 'Connection': 'keep-alive'
	});

	console.log('Client connected');


	icy.get(url, function (res_icy, err) {
		// log any "metadata" events that happen
		res_icy.on('metadata', function (metadata) {
			//me lo restituisce come oggetto
			var parsed = icy.parse(metadata);
			//trasformo in stringa il campo StreamTitle dell'oggetto parsed
			var parsed_s = String(parsed.StreamTitle);
			console.log(parsed_s);
			/**icecast manda un solo tipo di metadata ed è StreamTitle
			 * che segue il seguente formato: Autore - Titolo
			 * quindi divido la stringa in due sotto-stringhe a partire dal carattere -
			 */
			artista = parsed_s.split("-")[0];
			titolo = parsed_s.split("-")[1];
			//console.log(artista, titolo);

			getTesto(artista, titolo, res);
		});
		//se non mettessi questa non potrei ricevere altre risposte dal server (vedi Readable stream)
		res_icy.resume();
	})
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
	} catch (err) {
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
		db.collection("tracks.files").find().toArray(function (err, result) {
			var response = new Array();
			var i = 0;

			for (i; i < result.length; i++) {
				response.push({
					_id: result[i]._id,
					filename: result[i].filename,
					uploadDate: result[i].uploadDate
				});
			}
			res.json(response);
		});
	} catch (err) {
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
	const upload = multer({ storage: storage, limits: { fields: 1, fileSize: 20000000, files: 1, parts: 2 } });

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

/*
 *Definisco la callback di gestione dell'evento di connessione di un client
 *Dato che la connection può gestire più socket, devo passare come argomento della
 *callback la socket del client
*/

io.on('connection', function (socket) {

	socket.on('adduser', function (username) {
		console.log("\nsono entrato in adduser\n");
		//memorizzo l'username nella socket session per questo client
		socket.username = username;
		console.log(socket.username + ' è entrato nella chat!');
		usernames1[username] = username;
		//aggiungo la stanza 1 come quella di default quando un client si connette per la prima volta
		socket.room = 'stazione1';
		//aggiungo l'username del nuovo client alla lista dei client connessi
		add_user(socket.room, socket.username);
		socket.join('stazione1');
		//invio al client un messaggio di echo per la conferma della connessione
		socket.emit('updatechat', 'SERVER', 'ora sei connesso alla chat della ' + socket.room, false);
		//invio a tutti gli altri utenti della stazione1 che un nuovo utente si è connesso
		//NOTA: con broadcast si invia il messaggio a tutti gli altri client tranne chi lo invia
		socket.broadcast.to('stazione1').emit('updatechat', 'SERVER', username + 'si è connesso alla chat di questa stazione', false);
		//invio un evento di aggiornamento della lista degli utenti, in modo che lato client verrà aggiornata la lista degli utenti connessi
		update_users(socket);
	});

	//quando il client invia un evento di send ad una stazione, si invia a tutti i client in ascolto su quella socket un evento di updatechat, l'username di chi ha inviato il messaggio e il messaggio
	socket.on('send', function (data) {
		io.sockets.in(socket.room).emit('updatechat', socket.username, data, false);
	});

	socket.on('switchRoom', function (anotherRoom) {
		//elimino l'utente dalla lista
		delete_user(socket.room, socket.username);
		//lascio la stanza vecchia e mi unisco a quella nuova
		socket.leave(socket.room);
		//notifico a tutti gli altri utenti che questo utente ha lasciato la stanza
		socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + 'ha abbandonato questa stazione');
		//aggiorno la lista degli utenti della stanza vecchia
		update_users(socket);
		//join con la nuova stanza
		socket.join(anotherRoom);
		socket.room = anotherRoom;
		add_user(socket.room, socket.username);
		//notifico l'utente del join alla nuova stanza
		socket.emit('updatechat', 'SERVER: ', 'ora sei connesso alla chat della ' + socket.room, true);
		//notifico agli altri membri del nuovo utente
		socket.broadcast.to(anotherRoom).emit('updatechat', 'SERVER', socket.username + 'si è connesso alla chat di questa stazione', false);
		//aggiorno la lista degli utenti della nuova stanza per gli utenti della stanza
		update_users(socket);
		changeURLStation(anotherRoom);
	});

	socket.on('disconnect', function () {
		//elimino dall'array l'utente che si è disconnesso
		delete_user(socket.room, socket.username);
		//invio un evento di aggiornamento della lista degli utenti, in modo che lato client verrà aggiornata la lista degli utenti connessi
		update_users(socket);
		//invio agli altri client che l'utente si è disconnesso
		socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + 'ha abbandonato la chat', false);
	})
	socket.on('isTyping', function (data) {
		socket.broadcast.to(socket.room).emit('typing', data);
	});
});

function getTesto(artista, canzone, res) {
	music.artistSearch({ q_artist: artista, page_size: 1 })
		.then(function (data) {
			artist_id = parseInt(JSON.stringify((data.message.body.artist_list[0].artist.artist_id)));

			music.trackSearch({ q: canzone, page: 1, page_size: 1, f_artist_id: artist_id })
				.then(function (data) {

					track_id = parseInt(JSON.stringify(data.message.body.track_list[0].track.track_id));
					music.trackLyrics({ track_id: track_id })
						.then(function (data) {
							//console.log(data);
							qualcosa = JSON.stringify(data.message.body.lyrics.lyrics_body);
							qualcosa.replace('\n', "");
							//console.log(data.message.body.lyrics.lyrics_body);
							res.write('data: ' + qualcosa + '\n\n');
						}).catch(function () {
							res.write('data: testo non disponibile' + '\n\n');
							console.log("Testo non disponibile");
						})
				}).catch(function () {
					console.log("Canzone non disponibile");
				})
		}).catch(function () {
			console.log("Artista non disponibile");
		})

	/**NOTA sto usando le promise innestate(vedi https://stackoverflow.com/questions/3884281/what-does-the-function-then-mean-in-javascript per la spiegazione)
	 * Se non facessi questa scelta l'app non aspetterebbe la risposta del server alla prima richiesta
	 * (in questo caso music.artist_search) ma andrebbe subito a sottomettere la seconda e la terza richiesta.
	 * A questo punto il server di Musicmatch risponderebbe con error 401 perchè gli verrebbe passato null
	 * come valore della variabile trak_id e artist_id dato che l'app ancora deve ricevere la risposta dal server 
	 * relativa alla prima richiesta
	 */
}

function delete_user(room, user) {
	if (room === 'stazione1') {
		delete usernames1[user];
	}
	if (room === 'stazione2') {
		delete usernames2[user];
	}
	if (room === 'stazione3') {
		delete usernames3[user];
	}
}

function add_user(room, user) {
	if (room === 'stazione1') {
		usernames1[user] = user;
	}
	if (room === 'stazione2') {
		usernames2[user] = user;
	}
	if (room === 'stazione3') {
		usernames3[user] = user;
	}
}

function update_users(socket) {
	if (socket.room === 'stazione1') {
		socket.emit('updateusers', usernames1);
		socket.broadcast.to(socket.room).emit('updateusers', usernames1);
	}
	if (socket.room === 'stazione2') {
		socket.emit('updateusers', usernames2);
		socket.broadcast.to(socket.room).emit('updateusers', usernames2);
	}
	if (socket.room === 'stazione3') {
		socket.emit('updateusers', usernames3);
		socket.broadcast.to(socket.room).emit('updateusers', usernames3);
	}
}

function changeURLStation(room) {
	if (room === 'stazione1') {
		url = "http://localhost:8000/stazione1";
	}
	if (room === 'stazione2') {
		url = "http://localhost:8000/stazione2";
	}
	if (room === 'stazione3') {
		url = "http://localhost:8000/stazione3";
	}
	console.log("url: " + url);
	console.log("\n\nroom: " + room);
}