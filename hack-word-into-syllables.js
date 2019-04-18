var vowels = 'AEIOUY';

// Probably going to yield terrible results. It's a last resort.
function hackWordIntoSyllables(word) {
  var syllables = [];
  var currentSyllable = { isAWordGuess: true, wordGuess: '' };
  var haveVowel = false;
  var haveConsonant = false;

  for (var i = 0; i < word.length; ++i) {
    let char = word.charAt(i);
    currentSyllable.wordGuess += char;
    if (vowels.indexOf(char) === -1) {
      haveConsonant = true;
    } else {
      haveVowel = true;
    }
    if ((haveVowel && haveConsonant) || i === word.length - 1) {
      syllables.push(currentSyllable);
      currentSyllable = { isAWordGuess: true, wordGuess: '' };
      haveVowel = false;
      haveConsonant = false;
    }
  }

  return syllables;
}

module.exports = hackWordIntoSyllables;
