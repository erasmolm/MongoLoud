//richiamo la libreria express
var express = require('express');
music = require('musicmatch')({apikey:"bbb76a902fc3b440bb895445f9940fbc"});
var icy = require("icy");

//inizializzo il server
var app = require('express')();
const text_route = express.Router();
app.use('/testo',text_route);
app.use(express.static('public'));

//inizializzo il server
var http = require('http').Server(app);
var io = require('socket.io')(http);

//definisco l'array che contiene gli usernames degli utenti che si uniscono alla chat
var usernames1 = {};
var usernames2 = {};
var usernames3 = {};

var artista;
var canzone;

var url = 'http://localhost:8000/ices';

//definisco l'array contenente le rooms disponibili
var rooms = ['stazione1', 'stazione2', 'stazione3'];

//metto in ascolto il server sulla porta 4301
http.listen(4301, function(){
  console.log('Il server è in ascolto su http://localhost:4301');
});

text_route.get('/',function(req,res){
	res.writeHead(200, { 'Content-Type'  : 'text/event-stream'
	, 'Cache-Control' : 'no-cache'
	, 'Connection'    : 'keep-alive'
	});
 
	console.log('Client connected');  


	/*icy.get(url, function (res_icy,err) {

	 // log any "metadata" events that happen
	 res_icy.on('metadata', function (metadata) {
	   //me lo restituisce come oggetto
	   var parsed = icy.parse(metadata);
	   //trasformo in stringa il campo StreamTitle dell'oggetto parsed
	   var parsed_s = String(parsed.StreamTitle);
	   //console.log(parsed_s);
	   /*icecast manda un solo tipo di metadata ed è StreamTitle
		*che segue il seguente formato: Autore - Titolo
		*quindi divido la stringa in due sotto-stringhe a partire dal carattere -
	   */
	  /* artista = parsed_s.split("-")[0];
	   titolo = parsed_s.split("-")[1];
	  //console.log(artista, titolo);
	 
	 get_testo(artista,titolo,res);
	 });
	 //se non mettessi questa non potrei ricevere altre risposte dal server (vedi Readable stream)
	 res_icy.resume();
 })*/
});



function get_testo(artista, canzone, res){
 music.artistSearch({q_artist:artista, page_size:1})
	 .then(function(data){
		 artist_id = parseInt(JSON.stringify((data.message.body.artist_list[0].artist.artist_id)));
		 //console.log(artist_id);
		 music.trackSearch({q:canzone, page:1, page_size:1, f_artist_id:artist_id})
			 .then(function(data){
				 //console.log(data);
				 //console.log(data.message.body.track_list[0].track.track_id);
				 track_id = parseInt(JSON.stringify(data.message.body.track_list[0].track.track_id));
				 music.trackLyrics({track_id: track_id})
					 .then(function(data){
						 //console.log(data);
						 qualcosa = JSON.stringify(data.message.body.lyrics.lyrics_body);
						 qualcosa.replace('\n',"");
						 //console.log(data.message.body.lyrics.lyrics_body);
						 res.write('data: '+qualcosa+'\n\n');
					 }).catch(function(){
						 console.log("Testo non presente");
				 })
			 }).catch(function(){
				 console.log("Canzone non presente");
		 })
	 }).catch(function(){
		 console.log("Artista non presente");
 })

 /*NOTA sto usando le promise innestate(vedi https://stackoverflow.com/questions/3884281/what-does-the-function-then-mean-in-javascript per la spiegazione)
  *Se non facessi questa scelta l'app non aspetterebbe la risposta del server alla prima richiesta
  *(in questo caso music.artist_search) ma andrebbe subito a sottomettere la seconda e la terza richiesta.
  * A questo punto il server di Musicmatch risponderebbe con error 401 perchè gli verrebbe passato null
  * come valore della variabile trak_id e artist_id dato che l'app ancora deve ricevere la risposta dal server 
  * relativa alla prima richiesta
  */
}

/*
 *Definisco la callback di gestione dell'evento di connessione di un client
 *Dato che la connection può gestire più socket, devo passare come argomento della
 *callback la socket del client
*/

io.on('connection', function(socket){
	
	socket.on('adduser', function(username){
		/*f(username == null){
		   app.get('/', function(req, res){
  		   res.sendFile(__dirname + '/index.html');
		  });
		}*/
    	//memorizzo l'username nella socket session per questo client
    	socket.username = username;
    	console.log( socket.username + ' è entrato nella chat!');
     	usernames1[username] = username;
    	//aggiungo la stanza 1 come quella di default quando un client si connette per la prima volta
    	socket.room = 'stazione1';
    	//aggiungo l'username del nuovo client alla lista dei client connessi
    	add_user(socket.room,socket.username);
    	socket.join('stazione1');
    	//invio al client un messaggio di echo per la conferma della connessione
    	socket.emit('updatechat', 'SERVER', 'ora sei connesso alla chat della '+socket.room, false);
    	//invio a tutti gli altri utenti della stazione1 che un nuovo utente si è connesso
    	//NOTA: con broadcast si invia il messaggio a tutti gli altri client tranne chi lo invia
    	socket.broadcast.to('stazione1').emit('updatechat', 'SERVER', username + 'si è connesso alla chat di questa stazione',false);
    	//invio un evento di aggiornamento della lista degli utenti, in modo che lato client verrà aggiornata la lista degli utenti connessi
    	update_users(socket);
    	io.sockets.emit('updaterooms', rooms, 'room1');
	});

	//quando il client invia un evento di send ad una stazione, si invia a tutti i client in ascolto su quella socket un evento di updatechat, l'username di chi ha inviato il messaggio e il messaggio
	socket.on('send', function(data){
		io.sockets.in(socket.room).emit('updatechat', socket.username, data, false);
	});

	socket.on('switchRoom', function(anotherRoom){
		//elimino l'utente dalla lista
		delete_user(socket.room, socket.username);
		//lascio la stanza vecchia e mi unisco a quella nuova
		socket.leave(socket.room);
		//notifico a tutti gli altri utenti che questo utente ha lasciato la stanza
    	socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+'ha abbandonato questa stazione');
    	//aggiorno la lista degli utenti della stanza vecchia
    	update_users(socket);
    	//join con la nuova stanza
		socket.join(anotherRoom);
		socket.room = anotherRoom;
		add_user(socket.room,socket.username);
		//notifico l'utente del join alla nuova stanza
		socket.emit('updatechat', 'SERVER: ', 'ora sei connesso alla chat della '+socket.room, true);
    	//notifico agli altri membri del nuovo utente
    	socket.broadcast.to(anotherRoom).emit('updatechat', 'SERVER', socket.username + 'si è connesso alla chat di questa stazione',false);
		//aggiorno la lista degli utenti della nuova stanza per gli utenti della stanza
		update_users(socket);
		socket.emit('updaterooms', rooms, anotherRoom);
	});

	socket.on('disconnect', function(){
		//elimino dall'array l'utente che si è disconnesso
		delete_user(socket.room,socket.username);
    	//invio un evento di aggiornamento della lista degli utenti, in modo che lato client verrà aggiornata la lista degli utenti connessi
		update_users(socket);
		//invio agli altri client che l'utente si è disconnesso
		socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+'ha abbandonato la chat',false);
	})
	socket.on('isTyping', function(data){
		socket.broadcast.to(socket.room).emit('typing', data);
	});
});


function delete_user(room, user){
	if(room === 'stazione1'){
		delete usernames1[user];
	}
	if(room === 'stazione2'){
		delete usernames2[user];
	}else{
		delete usernames3[user];
	}
}

function add_user(room, user){
	if(room === 'stazione1'){
		usernames1[user]=user;
	}
	if(room === 'stazione2'){
		usernames2[user]=user;
	}else{
		usernames3[user]=user;
	}
}

function update_users(socket){
	if(socket.room === 'stazione1'){
		socket.emit('updateusers', usernames1);
		socket.broadcast.to(socket.room).emit('updateusers', usernames1);
	}
	if(socket.room === 'stazione2'){
		socket.emit('updateusers', usernames2);
		socket.broadcast.to(socket.room).emit('updateusers', usernames2);
	}else{
		socket.emit('updateusers', usernames3);
		socket.broadcast.to(socket.room).emit('updateusers', usernames3);
	}
}
