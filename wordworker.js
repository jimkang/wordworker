/* global __dirname */

var restify = require('restify');
var callNextTick = require('call-next-tick');
var url = require('url');
var querystring = require('querystring');
var createWordSyllableMap = require('word-syllable-map').createWordSyllableMap;
var createWordPhonemeMap = require('word-phoneme-map').createWordPhonemeMap;
var splitToWords = require('split-to-words');
var queue = require('d3-queue').queue;
var arpabetToIPA = require('./arpabet-to-ipa');
var curry = require('lodash.curry');

var sb = require('standard-bail')();

var wordSyllableMap = createWordSyllableMap({
  dbLocation: __dirname + '/db/word-syllable.db'
});
var wordPhonemeMap = createWordPhonemeMap({
  dbLocation: __dirname + '/db/word-phoneme.db'
});

function Wordworker({ secrets }, done) {
  var server = restify.createServer({
    name: 'wordworker'
  });

  var extraHeaders = ['authorization', 'content-type'];

  var corsSimple = restify.CORS({
    credentials: true,
    headers: extraHeaders
  });
  // This is actually what the preflight handler in the
  // router uses, not the CORS plugin functions.
  restify.CORS.ALLOW_HEADERS = restify.CORS.ALLOW_HEADERS.concat(extraHeaders);
  server.use(corsSimple);

  server.use(
    restify.bodyParser({
      mapFiles: true
    })
  );

  server.get('/health', respondOK);

  server.get('/syllables', getSyllables);
  server.head(/.*/, respondHead);

  callNextTick(done, null, server);

  function respondOK(req, res, next) {
    res.json(200, { message: 'OK!' });
    next();
  }

  function getSyllables(req, res, next) {
    if (req.headers.authorization !== `Key ${secrets.syllables}`) {
      res.json(401, {});
      next();
      return;
    }

    var parsed = url.parse(req.url);
    var queryParams = querystring.parse(parsed.search.slice(1));

    if (!queryParams.text) {
      res.json(400, { message: 'Missing text param in query string.' });
      next();
      return;
    }

    var words = splitToWords(queryParams.text);
    respondWithSyllables({ words, next, res });
  }

  function respondHead(req, res, next) {
    if (req.method !== 'OPTIONS') {
      res.writeHead(200, {
        'content-type': 'application/json'
      });
    } else {
      res.writeHead(200, 'OK');
    }
    res.end();
    next();
  }
}

function respondWithSyllables({ words, next, res }) {
  var q = queue();
  words.forEach(queueLookup);
  q.awaitAll(sb(getWordGuesses), next);

  function getWordGuesses(arpabetSyllableGroups) {
    var guessQueue = queue();
    arpabetSyllableGroups.forEach(queueGuess);
    guessQueue.awaitAll(
      sb(curry(passSyllables)(res, next, arpabetSyllableGroups), next)
    );

    function queueGuess(arpabetSyllable) {
      guessQueue.defer(guess, arpabetSyllable);
    }
  }

  function queueLookup(word) {
    q.defer(wordSyllableMap.syllablesForWord, word.toUpperCase());
  }
}

function guess(arpabetSyllable, done) {
  wordPhonemeMap.wordsForPhonemeSequence(arpabetSyllable, processGuessLookup);

  function processGuessLookup(error, matches) {
    if (error) {
      if (error.type === 'NotFoundError') {
        done(null, [arpabetSyllable]);
      } else {
        done(error);
      }
    } else {
      done(null, matches);
    }
  }
}

function passSyllables(res, next, arpabetSyllableGroups, wordGuesses) {
  res.json(200, {
    syllablesGroupedByWord: {
      arpabet: arpabetSyllableGroups,
      ipa: arpabetSyllableGroups.map(convertWordToIPA),
      wordGuesses
    }
  });
  next();
}

function convertWordToIPA(arpabetWord) {
  return arpabetWord.map(convertSyllableToIPA);
}

// This one returns a single string per syllable instead
// of an array of phonemes.
function convertSyllableToIPA(arpabetSyllable) {
  return arpabetSyllable.map(getIPAForPhoneme).join('');
}

function getIPAForPhoneme(arpabetPhoneme) {
  return arpabetToIPA[arpabetPhoneme];
}

module.exports = Wordworker;
