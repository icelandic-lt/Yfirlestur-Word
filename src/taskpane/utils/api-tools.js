/**
 *
 * @returns parTexts A numbered object of paragraphs from the document text
 */
function getParagraphTexts() {
  const body = DocumentApp.getActiveDocument().getBody();
  const numChildren = body.getNumChildren();
  const parTexts = {};

  for (let i = 0; i <= numChildren - 1; i += 1) {
    const currentChild = body.getChild(i);
    if (currentChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
      const parText = currentChild.getText();
      parTexts[i] = parText;
    } else {
      parTexts[i] = "";
    }
  }
  // Logger.log(parTexts);
  return parTexts;
}

function getCorrectedPar(text, parIndex) {
  let output;
  if (text !== "") {
    // Logger.log('Sending data...');
    // Make a POST request with a JSON payload.
    const data = {
      text,
    };
    const options = {
      method: "post",
      payload: data,
    };
    const response = UrlFetchApp.fetch("https://yfirlestur.is/correct.api", options);
    Logger.log("Response received");
    Logger.log(response.getContentText());

    output = processAPI(JSON.parse(response.getContentText()), parIndex);
  } else {
    output = "";
  }
  return output;
}

function range(start, end) {
  const ans = [];
  for (let i = start; i <= end; i++) {
    ans.push(i);
  }
  return ans;
}

// discards additional annotations if parse error in sentence
// done so annotations don't render on top of each other
// NOTE: fairly nuclear approach
// TODO: Invert this function so all others are kept and E001 discarded
function filterParseErrors(annotations) {
  for (let i = 0; i < annotations.length; i++) {
    if (annotations[i].code.includes("E001")) {
      return [annotations[i]];
    }
  }
  return annotations;
}

function adjustChars(p) {
  const paragraph = p;
  const START_INDEX = paragraph[0].tokens[0].i;
  // Logger.log("Sentence start index:", START_INDEX);
  paragraph.forEach((sentence, sentIndex) => {
    sentence.tokens.forEach((token, tokenIndex) => {
      // Logger.log("Token and index:", token.o, token.i);
      if (START_INDEX !== 0) {
        paragraph[sentIndex].tokens[tokenIndex].i -= START_INDEX;
      }
      // Logger.log("Token after adjust:", token.o, token.i);
    });
    sentence.annotations.forEach((annotation, annIndex) => {
      const firstTokenIndex = annotation.start;
      const lastTokenIndex = annotation.end;
      const relevantTokens = range(firstTokenIndex, lastTokenIndex);

      // Logger.log("Relevant tokens:", relevantTokens)

      let annLength = 0;
      relevantTokens.forEach((index) => {
        // Logger.log("selected token from range:", sentence.tokens[index]);

        // hacky approach to prevent inserted tokens from joining original annotation span length
        // ex. "ennþá" -> "enn þá" annotates as if original span is "ennþáþá"
        if (typeof sentence.tokens[index + 1] === "undefined") {
          annLength += sentence.tokens[index].o.length;
        } else if (sentence.tokens[index].i !== sentence.tokens[index + 1].i) {
          // const nextTokenStart = sentence.tokens[index+1].i;
          annLength += sentence.tokens[index].o.length;
        }
      });
      // Logger.log("processed ann length:", annLength);
      // Logger.log("New start Char:", annotation.start_char);
      paragraph[sentIndex].annotations[annIndex].start_char = sentence.tokens[firstTokenIndex].i;
      // Logger.log("Start char after change:", annotation.start_char)
      paragraph[sentIndex].annotations[annIndex].end_char = annotation.start_char + annLength;

      // if (paragraph[sentIndex].tokens[lastTokenIndex].o.match(/^ /) || lastTokenIndex === 0) {
      //     paragraph[sentIndex].annotations[annIndex].end_char += 1;
      // }
      // only tokens starting with whitespace need to increment start by one
      if (paragraph[sentIndex].tokens[firstTokenIndex].o.match(/^ /)) {
        paragraph[sentIndex].annotations[annIndex].start_char += 1;
      }
    });
  });

  return paragraph;
}

function getOriginalToken(parIndex, start, end) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const parText = body.getChild(parIndex).editAsText().getText();
  //   const rangeBuilder = doc.newRange();
  try {
    // rangeBuilder.addElement(parText, start, end);
    // const annRange = rangeBuilder.build();
    // const original = annRange
    //   .getRangeElements()[1]
    //   .getElement()
    //   .getText();
    const original = parText.slice(start, end);
    return original;
  } catch (error) {
    // rangeBuilder.addElement(parText, start, end - 1);
    // const annRange = rangeBuilder.build();
    // const original = annRange
    //   .getRangeElements()[0]
    //   .getElement()
    //   .getText();
    const original = parText.slice(start, end - 1);
    return original;
  }
  //   for (let i = 0; i < annRangeElements.length; i++) {
  //     const element = annRangeElements[i]; //   Logger.log(annRangeElements);
  //     Logger.log(element.getElement());
  //   }
  //   const original = '';
}

function processAPI(response, parIndex) {
  const json = response;
  // empty return array defined
  const annotationArray = [];

  // iterate through outer array
  for (let i = 0; i < json.result.length; i++) {
    // iterate through paragraphs
    let paragraphArray = [];
    // Logger.log("Paragraph before par adjust", json.result[i]);
    json.result[i] = adjustChars(json.result[i]);
    // Logger.log("Paragraph after par adjust", json.result[i]);
    for (var j = 0; j < json.result[i].length; j++) {
      // iterate through sentences
      // adjust likely errors in char locations from API
      // var adjustedJson = adjustChars(json.result[i][j]);
      const currentSentence = json.result[i][j];
      const anns = filterParseErrors(json.result[i][j].annotations);
      anns.forEach((ann) => {
        ann.sent = currentSentence.original;
        ann.token = currentSentence.token;
        ann.nonce = currentSentence.nonce;
        ann.parIndex = parIndex;
        ann.original = getOriginalToken(parIndex, ann.start_char, ann.end_char);
      });

      // Sentence text added to annotation data
      // var anns = insertSentenceText(json.result[i][j], json.result[i][j].annotations);
      // annotation added to return array
      paragraphArray = paragraphArray.concat(anns);
    }
    annotationArray.push(paragraphArray);
  }

  return annotationArray;
}

function getAllCorrections(inputTexts, numChildren) {
  const corrections = [];
  for (let i = 0; i <= numChildren - 1; i += 1) {
    const currentCorrection = getCorrectedPar(inputTexts[i], i)[0];
    corrections.push(currentCorrection);
  }
  return corrections.flat();
}

function getNumDocChildren() {
  const numChildren = DocumentApp.getActiveDocument().getBody().getNumChildren();
  return numChildren;
}

function startCorrection() {
  // Logger.log('Correction started!');
  // showSidebar()

  const numChildren = getNumDocChildren();

  const texts = getParagraphTexts();
  const allCorrections = getAllCorrections(texts, numChildren);
  // Logger.log('All corrections, processed:');
  // Logger.log(allCorrections);
  console.log(allCorrections);
  return allCorrections.filter(function (e) {
    return e;
  });
}

export { startCorrection };
