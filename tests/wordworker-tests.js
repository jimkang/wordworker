/* global process */
var test = require('tape');
var assertNoError = require('assert-no-error');
var WordWorker = require('../wordworker');
var request = require('request');

const port = 7568;
const serverHost = process.env.SERVER || 'localhost';

var testCases = [
/*
  {
    name: 'baby shark',
    endpoint: 'syllables',
    queryString: 'text=baby shark',
    secret: 'secret',
    secretToUse: 'secret',
    expectedStatusCode: 200,
    expectedBody: {
      syllablesGroupedByWord: {
        arpabet: [[['B', 'EY'], ['B', 'IY']], [['SH', 'AA', 'R', 'K']]],
        ipa: [['beɪ', 'bi'], ['ʃɑɹk']],
        wordGuesses: [
          ['BAY', 'BAYE', 'BAYH', 'BEY'],
          ['B', 'B.', 'BE', 'BEA', 'BEE'],
          ['SHARK']
        ]
      }
    }
  },
  {
    name: 'Syllable that does not have a word match in the database.',
    endpoint: 'syllables',
    queryString: 'text=dinosaur',
    secret: 'secret',
    secretToUse: 'secret',
    expectedStatusCode: 200,
    expectedBody: {
      syllablesGroupedByWord: {
        arpabet: [[['D', 'AY'], ['N', 'AH'], ['S', 'AO', 'R']]],
        ipa: [['daɪ', 'nʌ', 'sɔɹ']],
        wordGuesses: [
          ['DAI', 'DI', 'DIE', 'DYE'],
          ['nuh'],
          ['SAUR', 'SOAR', 'SOR', 'SORE']
        ]
      }
    }
  },
*/
  {
    name: 'Gibberish',
    endpoint: 'syllables',
    queryString: 'text=q9834hraj;skdflhsdafa2',
    secret: 'secret',
    secretToUse: 'secret',
    expectedStatusCode: 200,
    expectedBody: {
      syllablesGroupedByWord: {
        arpabet: [[['D', 'AY'], ['N', 'AH'], ['S', 'AO', 'R']]],
        ipa: [['daɪ', 'nʌ', 'sɔɹ']],
        wordGuesses: [
          ['DAI', 'DI', 'DIE', 'DYE'],
          ['nuh'],
          ['SAUR', 'SOAR', 'SOR', 'SORE']
        ]
      }
    }
  },

  {
    name: 'Bad secret auth',
    endpoint: 'syllables',
    queryString: 'text=whatever',
    secret: 'secret',
    secretToUse: 'bad-secret',
    expectedStatusCode: 401,
    expectedBody: {}
  }
];

testCases.forEach(runTest);

function runTest(testCase) {
  test(testCase.name, testEndpoint);

  function testEndpoint(t) {
    var server;
    var shutDownDB;

    WordWorker(
      {
        secrets: { syllables: testCase.secret }
      },
      startServer
    );

    function startServer(error, theServer, shutDown) {
      assertNoError(t.ok, error, 'Server created.');
      if (error) {
        console.log('Error creating server:', error);
        process.exit();
      }
      server = theServer;
      shutDownDB = shutDown;
      server.listen(port, runRequest);
    }

    function runRequest(error) {
      assertNoError(t.ok, error, 'Server started correctly.');
      var reqOpts = {
        method: 'GET',
        url: `http://${serverHost}:${port}/${testCase.endpoint}?${
          testCase.queryString
        }`,
        headers: {
          Authorization: `Key ${testCase.secretToUse}`
        }
      };

      reqOpts.json = true;
      request(reqOpts, checkResponse);
    }

    function checkResponse(error, res, body) {
      assertNoError(t.ok, error, 'No error while making request.');
      t.equal(
        res.statusCode,
        testCase.expectedStatusCode,
        'Correct status code is returned.'
      );
      if (res.statusCode !== 200) {
        console.log('body:', body);
      }
      t.deepEqual(body, testCase.expectedBody, 'Body is correct.');
      server.close(shutDown);
    }

    function shutDown() {
      shutDownDB(t.end);
    }
  }
}
