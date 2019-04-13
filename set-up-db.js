/* global __dirname */

var setUpDatabase = require('word-syllable-map').setUpDatabase;
var setUpWordPhonemeDatabase = require('word-phoneme-map').setUpDatabase;

setUpDatabase(
  {
    dbLocation: __dirname + '/db/word-syllable.db'
  },
  done
);

setUpWordPhonemeDatabase(
  {
    dbLocation: __dirname + '/db/word-phoneme.db'
  },
  done
);

function done(error) {
  if (error) {
    console.log(error);
  } else {
    console.log('Successfully set up database.');
  }
}
