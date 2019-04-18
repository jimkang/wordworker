var vowels = 'AEIOUY';

// Probably going to yield terrible results. It's a last resort.
function hackWordIntoSyllables(word) {
  var syllables = [];
  var currentSyllable = '';
  var haveVowel = false;
  var haveConsonant = false;

  for (var i = 0; i < word.length; ++i) {
    let char = word.charAt(i);
    currentSyllable += char;
    if (vowels.indexOf(char) === -1) {
      haveConsonant = true;
    } else {
      haveVowel = true;
    }
    if ((haveVowel && haveConsonant) || i === word.length - 1) {
      // Normally, syllables have multiple syllable matches, so they
      // are arrays. We only have one match, but it still has to be
      // in an array.
      syllables.push([currentSyllable]);
      currentSyllable = '';
      haveVowel = false;
      haveConsonant = false;
    }
  }
  return { isAWildGuess: true, syllables };
}

module.exports = hackWordIntoSyllables;
