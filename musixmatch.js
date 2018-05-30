music = require('musicmatch')({apikey:"bbb76a902fc3b440bb895445f9940fbc"});
var icy = require("icy")

var url = 'http://192.168.150.162:8000/ices';

var artista;
var canzone;

var track_id;
var artist_id;

icy.get(url, function (res) {

    // log any "metadata" events that happen
    res.on('metadata', function (metadata) {
      //me lo restituisce come oggetto
      var parsed = icy.parse(metadata);
      //trasformo in stringa il campo StreamTitle dell'oggetto parsed
      var parsed_s = String(parsed.StreamTitle);
      //console.log(parsed_s);
      /*icecast manda un solo tipo di metadata ed è StreamTitle
       *che segue il seguente formato: Autore - Titolo
       *quindi divido la stringa in due sotto-stringhe a partire dal carattere -
      */
      artista = parsed_s.split("-")[0];
      titolo = parsed_s.split("-")[1];
     //console.log(artista, titolo);
     get_testo(artista,titolo);
    });

    //se non mettessi questa si chiuderebbe la comunicazione col server
    res.resume();
});

function get_testo(artista, canzone){
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
	                        //var qualcosa = JSON.stringify(data);
	                        console.log(data.message.body.lyrics.lyrics_body);
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
