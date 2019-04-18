/* global __dirname */

var restify = require('restify');
var url = require('url');
var querystring = require('querystring');
var createWordSyllableMap = require('word-syllable-map').createWordSyllableMap;
var createWordPhonemeMap = require('word-phoneme-map').createWordPhonemeMap;
var splitToWords = require('split-to-words');
var queue = require('d3-queue').queue;
var arpabetToIPA = require('./arpabet-to-ipa');
var arpabetGuessText = require('./arpabet-guess-text');
var curry = require('lodash.curry');
var hackWordIntoSyllables = require('./hack-word-into-syllables');
var callNextTick = require('call-next-tick');

var sb = require('standard-bail')();

var wordSyllableMap = createWordSyllableMap({
  dbLocation: __dirname + '/db/word-syllable.db'
});
var wordPhonemeMap;

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

  createWordPhonemeMap(
    {
      dbLocation: __dirname + '/db/word-phoneme.db'
    },
    saveWordPhonemeMap
  );

  function saveWordPhonemeMap(error, theMap) {
    if (error) {
      done(error);
    } else {
      wordPhonemeMap = theMap;
      done(null, server, shutDownDB);
    }
  }

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
  q.awaitAll(curry(processSyllableLookupResult)(getWordGuesses, next, res));

  function queueLookup(word) {
    q.defer(getSyllablesForWordWithFallback, word.toUpperCase());
  }

  function getWordGuesses(arpabetSyllableGroupsForWords) {
    var guessQueue = queue();
    arpabetSyllableGroupsForWords.forEach(queueGuesses);
    guessQueue.awaitAll(
      sb(curry(passSyllables)(res, next, arpabetSyllableGroupsForWords), next)
    );

    function queueGuesses(arpabetSyllableGroup) {
      arpabetSyllableGroup.forEach(queueGuess);
    }

    function queueGuess(arpabetSyllable) {
      if (arpabetSyllable.isAWordGuess) {
        guessQueue.defer(curry(passToDone)(arpabetSyllable.wordGuess));
      } else {
        guessQueue.defer(guess, arpabetSyllable);
      }
    }
  }
}

function guess(arpabetSyllable, done) {
  wordPhonemeMap.wordsForPhonemeSequence(arpabetSyllable, processGuessLookup);

  function processGuessLookup(error, matches) {
    if (error) {
      if (error.type === 'NotFoundError') {
        done(null, [arpabetGuessText[arpabetSyllable]]);
      } else {
        done(error);
      }
    } else if (matches.length < 1) {
      done(null, [arpabetSyllable.map(getTextGuessForArpabetPhoneme).join('')]);
    } else {
      done(null, matches);
    }
  }
}

function passSyllables(res, next, arpabetSyllableGroups, wordGuesses) {
  var isAWildGuess = arpabetSyllableGroups.some(groupContainsAGuess);
  var arpabet = arpabetSyllableGroups.map(stripGuessTagsFromGroupOfSyllables);
  res.json(200, {
    isAWildGuess,
    syllablesGroupedByWord: {
      arpabet,
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
  if (Array.isArray(arpabetSyllable)) {
    return arpabetSyllable.map(getIPAForPhoneme).join('');
  } else {
    return '';
  }
}

function getIPAForPhoneme(arpabetPhoneme) {
  return arpabetToIPA[arpabetPhoneme];
}

function getTextGuessForArpabetPhoneme(arpabetPhoneme) {
  return arpabetGuessText[arpabetPhoneme];
}

function stripGuessTagsFromGroupOfSyllables(possibleGuessObjects) {
  return possibleGuessObjects.map(stripGuessTags);
}

function stripGuessTags(possibleGuessObject) {
  if (
    typeof possibleGuessObject === 'object' &&
    possibleGuessObject.isAWordGuess
  ) {
    return possibleGuessObject.wordGuess;
  }
  return possibleGuessObject;
}

function getSyllablesForWordWithFallback(word, done) {
  wordSyllableMap.syllablesForWord(word, fallback);

  function fallback(error, syllables) {
    if (error) {
      // If we don't know the word, try a (probably bad) guess.
      done(null, hackWordIntoSyllables(word));
    } else {
      done(null, syllables);
    }
  }
}

function processSyllableLookupResult(useResults, next, res, error, results) {
  if (error) {
    if (error.message.indexOf('Key not found in database') === 0) {
      res.json(404, { message: 'Word not found' });
      next();
    } else {
      next(error);
    }
  } else {
    useResults(results);
  }
}

function shutDownDB(done) {
  wordPhonemeMap.close(done);
}

function passToDone(x, done) {
  callNextTick(done, null, x);
}

function groupContainsAGuess(group) {
  return group.some(syllableIsAGuess);
}

function syllableIsAGuess(syllable) {
  return syllable && syllable.isAWordGuess;
}

module.exports = Wordworker;
