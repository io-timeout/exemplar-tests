# Tests exemplar does not pass

exemplar runs five collections of W3C tests, which [testing.md](../../docs/testing.md#w3c-conformance) describes. Two kinds of test do not pass:

- An **expected failure** is a test exemplar runs and fails. Each is listed in [`expected-failures.json`](expected-failures.json) with a one-line reason. The run still fails if a listed test starts passing, or if any other test fails.
- A test that is **not applicable** needs something exemplar does not have, such as XML Schema, or tests a rule that no longer holds. It is not run, and the reports count it in the "Not applicable" column.

A **catalogue correction** is neither: the test runs and passes, but against an index entry the runner corrects, because the suite's own entry is wrong. Each is explained at the end of this report.

This report explains every one of them in plain terms, with a short example, and names each test so that it can be checked independently. `test/exceptions.test.ts` fails when this report and the lists drift apart.

| Suite                      | Tests                | Expected failures          | Not applicable                                                                                    |
| -------------------------- | -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| XML Conformance Test Suite | 2,585                | 3, under `standalone` only | 313                                                                                               |
| DOM Conformance Test Suite | 1,532                | 40                         | 87                                                                                                |
| XInclude Test Suite        | 174                  | 2                          | 21                                                                                                |
| `xml:id` Test Suite        | 13                   | none                       | 2                                                                                                 |
| Canonical XML              | 6 examples, 21 cases | none                       | Example 3.7 of 1.0, 3.7 and 3.8 of 1.1, the Exclusive Canonicalization examples, and the 21 cases |

## Checking a test yourself

The suites are in `data/conformance/` at the repository root, unpacked, as checked against the SHA-256 that [`suites.json`](suites.json) pins. They come from:

- the XML suite: `https://www.w3.org/XML/Test/xmlts20130923.tar.gz`. The paths below are inside it, and its index files are the `.xml` catalogues each directory holds;
- the DOM suite: the pages under `https://www.w3.org/2004/04/ecmascript/`, linked below. Each page holds the JavaScript that runs and, at its foot, the XML description the W3C generated that JavaScript from, so the two can be compared;
- the XInclude suite: `https://www.w3.org/XML/Test/XInclude/XIncl20060927.tar.gz`, whose index is `XIncl20060927/testdescr.xml`;
- the `xml:id` suite: `https://www.w3.org/XML/2005/01/xml-id/`, whose index is `test-suite.xml`.

The examples below are shortened from the tests; the line numbers point at the full text, and for a DOM test they are lines of the page's source. The configurations are those of [testing.md](../../docs/testing.md#configurations): `standalone` opens no file but the document, while `external` and `validating` may read the DTDs and entities it names.

## Expected failures

### XML suite: 3 tests whose index entry is wrong

Each of these documents is broken on purpose, but the broken part is in a second file the document points to. The suite's index says the test needs no other file (`ENTITIES="none"`), so under `standalone`, where exemplar opens no other file, the runner still requires a rejection. exemplar cannot see an error in a file it does not open. Under `external` and `validating`, which may open it, exemplar rejects all three, for the reason the index gives.

```xml
<!-- ibm77n14.xml: nothing wrong in this file -->
<?xml version='1.1'?>
<!DOCTYPE root SYSTEM "ibm77n14.dtd">
<root>
</root>
```

```xml
<!-- ibm77n14.dtd: the error, an element name that starts with a digit -->
<!ELEMENT 0node EMPTY>
```

| Test                              | Files                                                         | Index entry                                    | Where the fault is                                                            |
| --------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `ibm-1-1-not-wf-P77-ibm77n13.xml` | `xmlconf/ibm/xml-1.1/not-wf/P77/ibm77n13.xml`, `.dtd`, `.ent` | `xmlconf/ibm/xml-1.1/ibm_not-wf.xml`, line 645 | `ibm77n13.ent` is XML 1.1, which an XML 1.0 document may not include          |
| `ibm-1-1-not-wf-P77-ibm77n14.xml` | `xmlconf/ibm/xml-1.1/not-wf/P77/ibm77n14.xml`, `.dtd`         | `xmlconf/ibm/xml-1.1/ibm_not-wf.xml`, line 650 | `ibm77n14.dtd` declares an element named `0node`                              |
| `ibm-1-1-not-wf-P77-ibm77n15.xml` | `xmlconf/ibm/xml-1.1/not-wf/P77/ibm77n15.xml`, `.dtd`, `.ent` | `xmlconf/ibm/xml-1.1/ibm_not-wf.xml`, line 656 | `ibm77n15.ent` holds the character U+007F, which XML 1.1 does not allow there |

### DOM suite: 28 tests broken by their translation into JavaScript

The W3C wrote the DOM tests in XML and converted them to JavaScript by machine. In these 28 the conversion produced broken code, so the test fails, or crashes, before it checks what it was written to check. The XML description at the foot of each page shows what the test meant.

#### A variable named like the method it should call (8 tests)

```js
var hasFeature;
hasFeature = hasFeature('SVG', null); // TypeError: hasFeature is not a function
```

The XML description asks the DOM implementation, `baseImpl`, which the JavaScript should write as `baseImpl.hasFeature('SVG', null)`.

| Test                                                                                                                | Line |
| ------------------------------------------------------------------------------------------------------------------- | ---- |
| [`domimplementationregistry08`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry08.html) | 91   |
| [`domimplementationregistry09`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry09.html) | 91   |
| [`domimplementationregistry10`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry10.html) | 91   |
| [`domimplementationregistry11`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry11.html) | 91   |
| [`domimplementationregistry19`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry19.html) | 94   |
| [`domimplementationregistry20`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry20.html) | 94   |
| [`domimplementationregistry21`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry21.html) | 94   |
| [`domimplementationregistry22`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry22.html) | 94   |

#### Positions that must be two values at once (7 tests)

`compareDocumentPosition` returns a number whose bits each mean something: 1 for "not in the same document", 32 for "the order is the implementation's choice", and so on. The XML description masks off the bits it tests; the JavaScript lost the masks, so it compares the whole number and asks for answers that cannot all hold:

```js
assertEquals('isImplSpecificDisconnected1', 33, position1); // exactly 33
assertEquals('isImplSpecificDisconnected2', 33, position2); // exactly 33
assert('notBothPreceding', position1 != position2); // yet different
```

The XML description keeps the masks:

```xml
<assertEquals bitmask='57' actual='documentPosition1' expected='33' id='isImplSpecificDisconnected1'/>
```

`nodecomparedocumentposition39` and `40` ask for the same number to be both 32 and 0.

| Test                                                                                                                    | Lines    |
| ----------------------------------------------------------------------------------------------------------------------- | -------- |
| [`nodecomparedocumentposition03`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition03.html) | 105, 107 |
| [`nodecomparedocumentposition05`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition05.html) | 106, 109 |
| [`nodecomparedocumentposition16`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition16.html) | 99, 101  |
| [`nodecomparedocumentposition23`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition23.html) | 101, 103 |
| [`nodecomparedocumentposition33`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition33.html) | 106, 108 |
| [`nodecomparedocumentposition39`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition39.html) | 98, 99   |
| [`nodecomparedocumentposition40`](https://www.w3.org/2004/04/ecmascript/level3/core/nodecomparedocumentposition40.html) | 99, 100  |

#### A result thrown away, then read (5 tests)

The XML description stores what `setUserData` returns, the previous value. The JavaScript drops it, so the variable the test then checks was never set:

```js
doc.setUserData('something', nullData, null); // should be prevUserData = doc.setUserData(…)
assertNull('nodesetuserdata01', prevUserData); // undefined, which is not null
```

| Test                                                                                            | Lines: the call, then the check |
| ----------------------------------------------------------------------------------------------- | ------------------------------- |
| [`nodesetuserdata01`](https://www.w3.org/2004/04/ecmascript/level3/core/nodesetuserdata01.html) | 96, 100                         |
| [`nodesetuserdata02`](https://www.w3.org/2004/04/ecmascript/level3/core/nodesetuserdata02.html) | 97, 101                         |
| [`nodesetuserdata03`](https://www.w3.org/2004/04/ecmascript/level3/core/nodesetuserdata03.html) | 99, 108                         |
| [`nodesetuserdata06`](https://www.w3.org/2004/04/ecmascript/level3/core/nodesetuserdata06.html) | 107, 116                        |
| [`nodesetuserdata07`](https://www.w3.org/2004/04/ecmascript/level3/core/nodesetuserdata07.html) | 107, 116                        |

#### A method handed over without its object (4 tests)

The XML description passes the monitor object as the handler. The JavaScript passes only its `handle` method, so when exemplar calls it, `this` is not the monitor and nothing is recorded. The test then finds no notifications where it expects two:

```js
node.setUserData('greeting', hello, userDataMonitor.handle); // the method alone
assertSize('twoNotifications', 2, notifications); // finds 0
```

| Test                                                                                            | Line |
| ----------------------------------------------------------------------------------------------- | ---- |
| [`userdatahandler01`](https://www.w3.org/2004/04/ecmascript/level3/core/userdatahandler01.html) | 111  |
| [`userdatahandler02`](https://www.w3.org/2004/04/ecmascript/level3/core/userdatahandler02.html) | 111  |
| [`userdatahandler03`](https://www.w3.org/2004/04/ecmascript/level3/core/userdatahandler03.html) | 126  |
| [`userdatahandler04`](https://www.w3.org/2004/04/ecmascript/level3/core/userdatahandler04.html) | 126  |

#### A property read from null (1 test)

```js
var errorHandler = null;
domConfig.setParameter('error-handler', errorHandler.handleError); // TypeError: reading handleError of null
```

The XML description sets the parameter to the null handler itself.

| Test                                                                                                      | Line |
| --------------------------------------------------------------------------------------------------------- | ---- |
| [`domconfigerrorhandler2`](https://www.w3.org/2004/04/ecmascript/level3/core/domconfigerrorhandler2.html) | 89   |

#### Not valid JavaScript (3 tests)

These pages cannot run at all: the generated script has a stray `else` with no `if`, or a function whose closing brace is missing. `node --check` on the page's script gives the error.

| Test                                                                                                                | Line                                   | Error                                  |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| [`documentnormalizedocument06`](https://www.w3.org/2004/04/ecmascript/level3/core/documentnormalizedocument06.html) | 93, where the unclosed function starts | `SyntaxError: Unexpected end of input` |
| [`domimplementationregistry12`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry12.html) | 106                                    | `SyntaxError: Unexpected token 'else'` |
| [`domimplementationregistry23`](https://www.w3.org/2004/04/ecmascript/level3/core/domimplementationregistry23.html) | 108                                    | `SyntaxError: Unexpected token 'else'` |

### DOM suite: 5 tests that ask for the wrong answer

Each of these expects something the DOM specification forbids, or that another test in the same suite forbids.

| Test                                                                                                                            | Line | What it asks for                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| [`documentnormalizedocument10`](https://www.w3.org/2004/04/ecmascript/level3/core/documentnormalizedocument10.html)             | 104  | A second root element                                          |
| [`documentnormalizedocument11`](https://www.w3.org/2004/04/ecmascript/level3/core/documentnormalizedocument11.html)             | 118  | An `acronym` element named `address`                           |
| [`domconfigurationcansetparameter03`](https://www.w3.org/2004/04/ecmascript/level3/core/domconfigurationcansetparameter03.html) | 107  | Finding an entity by namespace                                 |
| [`domconfigurationcansetparameter06`](https://www.w3.org/2004/04/ecmascript/level3/core/domconfigurationcansetparameter06.html) | 108  | Spaces in a text element counted as element-content whitespace |
| [`nodeisequalnode03`](https://www.w3.org/2004/04/ecmascript/level3/core/nodeisequalnode03.html)                                 | 105  | Two documents with different DOCTYPEs called equal             |

**A second root element.** The document already has a root element, and a document may have only one. The DOM specification says `appendChild` must then throw `HIERARCHY_REQUEST_ERR`, which exemplar does, so the rest of the test never runs.

```js
doc = load(docRef, 'doc', 'hc_staff'); // already has its root, <html>
doc.appendChild(doc.createElement('newElem')); // a second root
```

**An `acronym` named `address`.** An element's name is what its tag says.

```js
elem = doc.getElementsByTagNameNS('*', 'acronym').item(1);
assertEquals('documentnormalizedocument11_namespaceDeclarations', 'address', elem.nodeName);
```

**Finding an entity by namespace.** Entities have no namespace, and DOM Level 2 says `getNamedItemNS` finds none of them. The Level 2 tests `getNamedItemNS03` and `namednodemapgetnameditemns01`, in the same suite, check that it returns null, which exemplar does. Both cannot pass.

```js
entity = doc.doctype.entities.getNamedItemNS(null, 'epsilon'); // this test expects the entity
```

**Spaces in a text element.** The test's DTD, `files/xhtml1-strict.dtd`, declares `<!ELEMENT strong (#PCDATA)>`, so `strong` holds text. "Element-content whitespace" means only the spaces between child elements, in an element that may hold elements alone. Spaces in a text element are text, so the answer is false.

```js
strong.firstChild.textContent = '    ';
assertTrue('domconfigurationsetparameter06_2', strong.firstChild.isElementContentWhitespace);
```

**Documents with different DOCTYPEs.** DOM Level 3 calls two documents equal only if their DOCTYPEs are, and two DOCTYPEs equal only if their internal subsets match. `files/barfoo_utf8.xml` declares `script` in its internal subset and `files/barfoo_utf16.xml` does not, so the answer is false.

```js
doc1 = load(doc1Ref, 'doc1', 'barfoo_utf8');
doc2 = load(doc2Ref, 'doc2', 'barfoo_utf16');
assertTrue('docAreNotEquals', doc1.isEqualNode(doc2));
```

### DOM suite: 7 tests of an older rule for names

```js
doc.createElementNS('http://www.example.org/domts/wellformed01', 'LegalName\u088E');
```

U+088E is an Arabic letter, ࢎ. The XML 1.0 rules in force when these tests were written, the Fourth Edition of 2006, did not allow it in names. The current rules, the Fifth Edition of 2008, do, and exemplar's parser follows them. The tests expect the DOM to reject the name in an XML 1.0 document. If it did, exemplar could read a file holding `<LegalNameࢎ/>` but could not create the same element.

| Test                                                                                        | Line | Creates      |
| ------------------------------------------------------------------------------------------- | ---- | ------------ |
| [`canonicalform06`](https://www.w3.org/2004/04/ecmascript/level3/core/canonicalform06.html) | 101  | an element   |
| [`infoset06`](https://www.w3.org/2004/04/ecmascript/level3/core/infoset06.html)             | 100  | an element   |
| [`infoset07`](https://www.w3.org/2004/04/ecmascript/level3/core/infoset07.html)             | 101  | an attribute |
| [`wellformed01`](https://www.w3.org/2004/04/ecmascript/level3/core/wellformed01.html)       | 100  | an element   |
| [`wellformed02`](https://www.w3.org/2004/04/ecmascript/level3/core/wellformed02.html)       | 96   | an element   |
| [`wellformed03`](https://www.w3.org/2004/04/ecmascript/level3/core/wellformed03.html)       | 101  | an attribute |
| [`wellformed04`](https://www.w3.org/2004/04/ecmascript/level3/core/wellformed04.html)       | 100  | an attribute |

### XInclude suite: 2 tests that merge declarations the specification keeps apart

Each of these documents declares an unparsed entity `image` and a notation `jpg`, and includes `ents/unparent.xml`, which declares them again with the same system identifiers, `gris.jpg` and `jpg`. The two files are in different directories, so the declarations name different files: `docs/gris.jpg` and `ents/gris.jpg`. The tests expect them merged as duplicates. XInclude §4.5.1 and §4.5.2 count declarations as duplicates only when their declaration base URIs match too, or when the system identifiers resolve to the same URI, and make two with the same name that are not duplicates a fatal error. exemplar, like the JDK, rejects both documents. The tests date from January 2003, before the Recommendation.

```xml
<!-- docs/nist-include-55.xml -->
<!DOCTYPE x [ <!NOTATION jpg SYSTEM "jpg"> <!ENTITY image SYSTEM "gris.jpg" NDATA jpg> … ]>
<x><xinclude:include href="../ents/unparent.xml"/><view sun="image"/></x>

<!-- ents/unparent.xml: the same declarations, resolved against ents/ -->
<!DOCTYPE view [ <!NOTATION jpg SYSTEM "jpg"> <!ENTITY image SYSTEM "gris.jpg" NDATA jpg> … ]>
<view sun="image"/>
```

| Test              | Files                                                                   | Index entry                             |
| ----------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `Nist-include-21` | `XIncl20060927/Nist/test/docs/nist-include-21.xml`, `ents/unparent.xml` | `XIncl20060927/testdescr.xml`, line 319 |
| `Nist-include-55` | `XIncl20060927/Nist/test/docs/nist-include-55.xml`, `ents/unparent.xml` | `XIncl20060927/testdescr.xml`, line 615 |

## Tests that do not apply

### XML suite: 313 tests of name rules the Fifth Edition removed

Until its Fourth Edition, XML 1.0 listed, in Appendix B, exactly which Unicode characters may appear in names: productions 84 to 89, `Letter`, `BaseChar`, `Ideographic`, `CombiningChar`, `Digit` and `Extender`. The Fifth Edition of 2008 replaced these lists with broad ranges, so that names may use almost any letter, including those added to Unicode since. These tests check that a character outside the old lists is rejected, which no longer holds. The suite's index marks each of them `EDITION="1 2 3 4"`, and the runner leaves out any test whose editions do not include the fifth.

```xml
<!-- ibm85n03.xml: Ĳ (U+0132) was not a BaseChar, so this PI target was an error -->
<!DOCTYPE animal [
<!ELEMENT animal ANY>
<?Ĳ an illegal char #x132 in PITarget ?>
]>
<animal/>
```

Under the Fifth Edition, `Ĳ` may start a name, and exemplar accepts the document. One test in the group is of another kind: `x-rmt-008` declares `version="1.7"`, which the Fourth Edition rejected and the Fifth accepts as a document to be read as XML 1.0.

The reports count each test once per configuration, as 312 `not-wf` tests and 1 `error` test.

<details>
<summary>Appendix B, production 85, BaseChar: 196 tests</summary>

| Test                           | File                                   |
| ------------------------------ | -------------------------------------- |
| `ibm-not-wf-P85-ibm85n03.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n03.xml`  |
| `ibm-not-wf-P85-ibm85n04.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n04.xml`  |
| `ibm-not-wf-P85-ibm85n05.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n05.xml`  |
| `ibm-not-wf-P85-ibm85n06.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n06.xml`  |
| `ibm-not-wf-P85-ibm85n07.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n07.xml`  |
| `ibm-not-wf-P85-ibm85n08.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n08.xml`  |
| `ibm-not-wf-P85-ibm85n09.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n09.xml`  |
| `ibm-not-wf-P85-ibm85n10.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n10.xml`  |
| `ibm-not-wf-P85-ibm85n100.xml` | `xmlconf/ibm/not-wf/P85/ibm85n100.xml` |
| `ibm-not-wf-P85-ibm85n101.xml` | `xmlconf/ibm/not-wf/P85/ibm85n101.xml` |
| `ibm-not-wf-P85-ibm85n102.xml` | `xmlconf/ibm/not-wf/P85/ibm85n102.xml` |
| `ibm-not-wf-P85-ibm85n103.xml` | `xmlconf/ibm/not-wf/P85/ibm85n103.xml` |
| `ibm-not-wf-P85-ibm85n104.xml` | `xmlconf/ibm/not-wf/P85/ibm85n104.xml` |
| `ibm-not-wf-P85-ibm85n105.xml` | `xmlconf/ibm/not-wf/P85/ibm85n105.xml` |
| `ibm-not-wf-P85-ibm85n106.xml` | `xmlconf/ibm/not-wf/P85/ibm85n106.xml` |
| `ibm-not-wf-P85-ibm85n107.xml` | `xmlconf/ibm/not-wf/P85/ibm85n107.xml` |
| `ibm-not-wf-P85-ibm85n108.xml` | `xmlconf/ibm/not-wf/P85/ibm85n108.xml` |
| `ibm-not-wf-P85-ibm85n109.xml` | `xmlconf/ibm/not-wf/P85/ibm85n109.xml` |
| `ibm-not-wf-P85-ibm85n11.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n11.xml`  |
| `ibm-not-wf-P85-ibm85n110.xml` | `xmlconf/ibm/not-wf/P85/ibm85n110.xml` |
| `ibm-not-wf-P85-ibm85n111.xml` | `xmlconf/ibm/not-wf/P85/ibm85n111.xml` |
| `ibm-not-wf-P85-ibm85n112.xml` | `xmlconf/ibm/not-wf/P85/ibm85n112.xml` |
| `ibm-not-wf-P85-ibm85n113.xml` | `xmlconf/ibm/not-wf/P85/ibm85n113.xml` |
| `ibm-not-wf-P85-ibm85n114.xml` | `xmlconf/ibm/not-wf/P85/ibm85n114.xml` |
| `ibm-not-wf-P85-ibm85n115.xml` | `xmlconf/ibm/not-wf/P85/ibm85n115.xml` |
| `ibm-not-wf-P85-ibm85n116.xml` | `xmlconf/ibm/not-wf/P85/ibm85n116.xml` |
| `ibm-not-wf-P85-ibm85n117.xml` | `xmlconf/ibm/not-wf/P85/ibm85n117.xml` |
| `ibm-not-wf-P85-ibm85n118.xml` | `xmlconf/ibm/not-wf/P85/ibm85n118.xml` |
| `ibm-not-wf-P85-ibm85n119.xml` | `xmlconf/ibm/not-wf/P85/ibm85n119.xml` |
| `ibm-not-wf-P85-ibm85n12.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n12.xml`  |
| `ibm-not-wf-P85-ibm85n120.xml` | `xmlconf/ibm/not-wf/P85/ibm85n120.xml` |
| `ibm-not-wf-P85-ibm85n121.xml` | `xmlconf/ibm/not-wf/P85/ibm85n121.xml` |
| `ibm-not-wf-P85-ibm85n122.xml` | `xmlconf/ibm/not-wf/P85/ibm85n122.xml` |
| `ibm-not-wf-P85-ibm85n123.xml` | `xmlconf/ibm/not-wf/P85/ibm85n123.xml` |
| `ibm-not-wf-P85-ibm85n124.xml` | `xmlconf/ibm/not-wf/P85/ibm85n124.xml` |
| `ibm-not-wf-P85-ibm85n125.xml` | `xmlconf/ibm/not-wf/P85/ibm85n125.xml` |
| `ibm-not-wf-P85-ibm85n126.xml` | `xmlconf/ibm/not-wf/P85/ibm85n126.xml` |
| `ibm-not-wf-P85-ibm85n127.xml` | `xmlconf/ibm/not-wf/P85/ibm85n127.xml` |
| `ibm-not-wf-P85-ibm85n128.xml` | `xmlconf/ibm/not-wf/P85/ibm85n128.xml` |
| `ibm-not-wf-P85-ibm85n129.xml` | `xmlconf/ibm/not-wf/P85/ibm85n129.xml` |
| `ibm-not-wf-P85-ibm85n13.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n13.xml`  |
| `ibm-not-wf-P85-ibm85n130.xml` | `xmlconf/ibm/not-wf/P85/ibm85n130.xml` |
| `ibm-not-wf-P85-ibm85n131.xml` | `xmlconf/ibm/not-wf/P85/ibm85n131.xml` |
| `ibm-not-wf-P85-ibm85n132.xml` | `xmlconf/ibm/not-wf/P85/ibm85n132.xml` |
| `ibm-not-wf-P85-ibm85n133.xml` | `xmlconf/ibm/not-wf/P85/ibm85n133.xml` |
| `ibm-not-wf-P85-ibm85n134.xml` | `xmlconf/ibm/not-wf/P85/ibm85n134.xml` |
| `ibm-not-wf-P85-ibm85n135.xml` | `xmlconf/ibm/not-wf/P85/ibm85n135.xml` |
| `ibm-not-wf-P85-ibm85n136.xml` | `xmlconf/ibm/not-wf/P85/ibm85n136.xml` |
| `ibm-not-wf-P85-ibm85n137.xml` | `xmlconf/ibm/not-wf/P85/ibm85n137.xml` |
| `ibm-not-wf-P85-ibm85n138.xml` | `xmlconf/ibm/not-wf/P85/ibm85n138.xml` |
| `ibm-not-wf-P85-ibm85n139.xml` | `xmlconf/ibm/not-wf/P85/ibm85n139.xml` |
| `ibm-not-wf-P85-ibm85n14.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n14.xml`  |
| `ibm-not-wf-P85-ibm85n140.xml` | `xmlconf/ibm/not-wf/P85/ibm85n140.xml` |
| `ibm-not-wf-P85-ibm85n141.xml` | `xmlconf/ibm/not-wf/P85/ibm85n141.xml` |
| `ibm-not-wf-P85-ibm85n142.xml` | `xmlconf/ibm/not-wf/P85/ibm85n142.xml` |
| `ibm-not-wf-P85-ibm85n143.xml` | `xmlconf/ibm/not-wf/P85/ibm85n143.xml` |
| `ibm-not-wf-P85-ibm85n144.xml` | `xmlconf/ibm/not-wf/P85/ibm85n144.xml` |
| `ibm-not-wf-P85-ibm85n145.xml` | `xmlconf/ibm/not-wf/P85/ibm85n145.xml` |
| `ibm-not-wf-P85-ibm85n146.xml` | `xmlconf/ibm/not-wf/P85/ibm85n146.xml` |
| `ibm-not-wf-P85-ibm85n147.xml` | `xmlconf/ibm/not-wf/P85/ibm85n147.xml` |
| `ibm-not-wf-P85-ibm85n148.xml` | `xmlconf/ibm/not-wf/P85/ibm85n148.xml` |
| `ibm-not-wf-P85-ibm85n149.xml` | `xmlconf/ibm/not-wf/P85/ibm85n149.xml` |
| `ibm-not-wf-P85-ibm85n15.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n15.xml`  |
| `ibm-not-wf-P85-ibm85n150.xml` | `xmlconf/ibm/not-wf/P85/ibm85n150.xml` |
| `ibm-not-wf-P85-ibm85n151.xml` | `xmlconf/ibm/not-wf/P85/ibm85n151.xml` |
| `ibm-not-wf-P85-ibm85n152.xml` | `xmlconf/ibm/not-wf/P85/ibm85n152.xml` |
| `ibm-not-wf-P85-ibm85n153.xml` | `xmlconf/ibm/not-wf/P85/ibm85n153.xml` |
| `ibm-not-wf-P85-ibm85n154.xml` | `xmlconf/ibm/not-wf/P85/ibm85n154.xml` |
| `ibm-not-wf-P85-ibm85n155.xml` | `xmlconf/ibm/not-wf/P85/ibm85n155.xml` |
| `ibm-not-wf-P85-ibm85n156.xml` | `xmlconf/ibm/not-wf/P85/ibm85n156.xml` |
| `ibm-not-wf-P85-ibm85n157.xml` | `xmlconf/ibm/not-wf/P85/ibm85n157.xml` |
| `ibm-not-wf-P85-ibm85n158.xml` | `xmlconf/ibm/not-wf/P85/ibm85n158.xml` |
| `ibm-not-wf-P85-ibm85n159.xml` | `xmlconf/ibm/not-wf/P85/ibm85n159.xml` |
| `ibm-not-wf-P85-ibm85n16.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n16.xml`  |
| `ibm-not-wf-P85-ibm85n160.xml` | `xmlconf/ibm/not-wf/P85/ibm85n160.xml` |
| `ibm-not-wf-P85-ibm85n161.xml` | `xmlconf/ibm/not-wf/P85/ibm85n161.xml` |
| `ibm-not-wf-P85-ibm85n162.xml` | `xmlconf/ibm/not-wf/P85/ibm85n162.xml` |
| `ibm-not-wf-P85-ibm85n163.xml` | `xmlconf/ibm/not-wf/P85/ibm85n163.xml` |
| `ibm-not-wf-P85-ibm85n164.xml` | `xmlconf/ibm/not-wf/P85/ibm85n164.xml` |
| `ibm-not-wf-P85-ibm85n165.xml` | `xmlconf/ibm/not-wf/P85/ibm85n165.xml` |
| `ibm-not-wf-P85-ibm85n166.xml` | `xmlconf/ibm/not-wf/P85/ibm85n166.xml` |
| `ibm-not-wf-P85-ibm85n167.xml` | `xmlconf/ibm/not-wf/P85/ibm85n167.xml` |
| `ibm-not-wf-P85-ibm85n168.xml` | `xmlconf/ibm/not-wf/P85/ibm85n168.xml` |
| `ibm-not-wf-P85-ibm85n169.xml` | `xmlconf/ibm/not-wf/P85/ibm85n169.xml` |
| `ibm-not-wf-P85-ibm85n17.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n17.xml`  |
| `ibm-not-wf-P85-ibm85n170.xml` | `xmlconf/ibm/not-wf/P85/ibm85n170.xml` |
| `ibm-not-wf-P85-ibm85n171.xml` | `xmlconf/ibm/not-wf/P85/ibm85n171.xml` |
| `ibm-not-wf-P85-ibm85n172.xml` | `xmlconf/ibm/not-wf/P85/ibm85n172.xml` |
| `ibm-not-wf-P85-ibm85n173.xml` | `xmlconf/ibm/not-wf/P85/ibm85n173.xml` |
| `ibm-not-wf-P85-ibm85n174.xml` | `xmlconf/ibm/not-wf/P85/ibm85n174.xml` |
| `ibm-not-wf-P85-ibm85n175.xml` | `xmlconf/ibm/not-wf/P85/ibm85n175.xml` |
| `ibm-not-wf-P85-ibm85n176.xml` | `xmlconf/ibm/not-wf/P85/ibm85n176.xml` |
| `ibm-not-wf-P85-ibm85n177.xml` | `xmlconf/ibm/not-wf/P85/ibm85n177.xml` |
| `ibm-not-wf-P85-ibm85n178.xml` | `xmlconf/ibm/not-wf/P85/ibm85n178.xml` |
| `ibm-not-wf-P85-ibm85n179.xml` | `xmlconf/ibm/not-wf/P85/ibm85n179.xml` |
| `ibm-not-wf-P85-ibm85n18.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n18.xml`  |
| `ibm-not-wf-P85-ibm85n180.xml` | `xmlconf/ibm/not-wf/P85/ibm85n180.xml` |
| `ibm-not-wf-P85-ibm85n181.xml` | `xmlconf/ibm/not-wf/P85/ibm85n181.xml` |
| `ibm-not-wf-P85-ibm85n182.xml` | `xmlconf/ibm/not-wf/P85/ibm85n182.xml` |
| `ibm-not-wf-P85-ibm85n183.xml` | `xmlconf/ibm/not-wf/P85/ibm85n183.xml` |
| `ibm-not-wf-P85-ibm85n184.xml` | `xmlconf/ibm/not-wf/P85/ibm85n184.xml` |
| `ibm-not-wf-P85-ibm85n185.xml` | `xmlconf/ibm/not-wf/P85/ibm85n185.xml` |
| `ibm-not-wf-P85-ibm85n186.xml` | `xmlconf/ibm/not-wf/P85/ibm85n186.xml` |
| `ibm-not-wf-P85-ibm85n187.xml` | `xmlconf/ibm/not-wf/P85/ibm85n187.xml` |
| `ibm-not-wf-P85-ibm85n188.xml` | `xmlconf/ibm/not-wf/P85/ibm85n188.xml` |
| `ibm-not-wf-P85-ibm85n189.xml` | `xmlconf/ibm/not-wf/P85/ibm85n189.xml` |
| `ibm-not-wf-P85-ibm85n19.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n19.xml`  |
| `ibm-not-wf-P85-ibm85n190.xml` | `xmlconf/ibm/not-wf/P85/ibm85n190.xml` |
| `ibm-not-wf-P85-ibm85n191.xml` | `xmlconf/ibm/not-wf/P85/ibm85n191.xml` |
| `ibm-not-wf-P85-ibm85n192.xml` | `xmlconf/ibm/not-wf/P85/ibm85n192.xml` |
| `ibm-not-wf-P85-ibm85n193.xml` | `xmlconf/ibm/not-wf/P85/ibm85n193.xml` |
| `ibm-not-wf-P85-ibm85n194.xml` | `xmlconf/ibm/not-wf/P85/ibm85n194.xml` |
| `ibm-not-wf-P85-ibm85n195.xml` | `xmlconf/ibm/not-wf/P85/ibm85n195.xml` |
| `ibm-not-wf-P85-ibm85n196.xml` | `xmlconf/ibm/not-wf/P85/ibm85n196.xml` |
| `ibm-not-wf-P85-ibm85n197.xml` | `xmlconf/ibm/not-wf/P85/ibm85n197.xml` |
| `ibm-not-wf-P85-ibm85n198.xml` | `xmlconf/ibm/not-wf/P85/ibm85n198.xml` |
| `ibm-not-wf-P85-ibm85n20.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n20.xml`  |
| `ibm-not-wf-P85-ibm85n21.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n21.xml`  |
| `ibm-not-wf-P85-ibm85n22.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n22.xml`  |
| `ibm-not-wf-P85-ibm85n23.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n23.xml`  |
| `ibm-not-wf-P85-ibm85n24.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n24.xml`  |
| `ibm-not-wf-P85-ibm85n25.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n25.xml`  |
| `ibm-not-wf-P85-ibm85n26.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n26.xml`  |
| `ibm-not-wf-P85-ibm85n27.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n27.xml`  |
| `ibm-not-wf-P85-ibm85n28.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n28.xml`  |
| `ibm-not-wf-P85-ibm85n29.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n29.xml`  |
| `ibm-not-wf-P85-ibm85n30.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n30.xml`  |
| `ibm-not-wf-P85-ibm85n31.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n31.xml`  |
| `ibm-not-wf-P85-ibm85n32.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n32.xml`  |
| `ibm-not-wf-P85-ibm85n33.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n33.xml`  |
| `ibm-not-wf-P85-ibm85n34.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n34.xml`  |
| `ibm-not-wf-P85-ibm85n35.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n35.xml`  |
| `ibm-not-wf-P85-ibm85n36.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n36.xml`  |
| `ibm-not-wf-P85-ibm85n37.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n37.xml`  |
| `ibm-not-wf-P85-ibm85n38.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n38.xml`  |
| `ibm-not-wf-P85-ibm85n39.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n39.xml`  |
| `ibm-not-wf-P85-ibm85n40.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n40.xml`  |
| `ibm-not-wf-P85-ibm85n41.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n41.xml`  |
| `ibm-not-wf-P85-ibm85n42.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n42.xml`  |
| `ibm-not-wf-P85-ibm85n43.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n43.xml`  |
| `ibm-not-wf-P85-ibm85n44.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n44.xml`  |
| `ibm-not-wf-P85-ibm85n45.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n45.xml`  |
| `ibm-not-wf-P85-ibm85n46.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n46.xml`  |
| `ibm-not-wf-P85-ibm85n47.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n47.xml`  |
| `ibm-not-wf-P85-ibm85n48.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n48.xml`  |
| `ibm-not-wf-P85-ibm85n49.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n49.xml`  |
| `ibm-not-wf-P85-ibm85n50.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n50.xml`  |
| `ibm-not-wf-P85-ibm85n51.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n51.xml`  |
| `ibm-not-wf-P85-ibm85n52.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n52.xml`  |
| `ibm-not-wf-P85-ibm85n53.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n53.xml`  |
| `ibm-not-wf-P85-ibm85n54.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n54.xml`  |
| `ibm-not-wf-P85-ibm85n55.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n55.xml`  |
| `ibm-not-wf-P85-ibm85n56.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n56.xml`  |
| `ibm-not-wf-P85-ibm85n57.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n57.xml`  |
| `ibm-not-wf-P85-ibm85n58.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n58.xml`  |
| `ibm-not-wf-P85-ibm85n59.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n59.xml`  |
| `ibm-not-wf-P85-ibm85n60.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n60.xml`  |
| `ibm-not-wf-P85-ibm85n61.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n61.xml`  |
| `ibm-not-wf-P85-ibm85n62.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n62.xml`  |
| `ibm-not-wf-P85-ibm85n63.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n63.xml`  |
| `ibm-not-wf-P85-ibm85n64.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n64.xml`  |
| `ibm-not-wf-P85-ibm85n65.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n65.xml`  |
| `ibm-not-wf-P85-ibm85n66.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n66.xml`  |
| `ibm-not-wf-P85-ibm85n67.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n67.xml`  |
| `ibm-not-wf-P85-ibm85n68.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n68.xml`  |
| `ibm-not-wf-P85-ibm85n69.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n69.xml`  |
| `ibm-not-wf-P85-ibm85n70.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n70.xml`  |
| `ibm-not-wf-P85-ibm85n71.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n71.xml`  |
| `ibm-not-wf-P85-ibm85n72.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n72.xml`  |
| `ibm-not-wf-P85-ibm85n73.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n73.xml`  |
| `ibm-not-wf-P85-ibm85n74.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n74.xml`  |
| `ibm-not-wf-P85-ibm85n75.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n75.xml`  |
| `ibm-not-wf-P85-ibm85n76.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n76.xml`  |
| `ibm-not-wf-P85-ibm85n77.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n77.xml`  |
| `ibm-not-wf-P85-ibm85n78.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n78.xml`  |
| `ibm-not-wf-P85-ibm85n79.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n79.xml`  |
| `ibm-not-wf-P85-ibm85n80.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n80.xml`  |
| `ibm-not-wf-P85-ibm85n81.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n81.xml`  |
| `ibm-not-wf-P85-ibm85n82.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n82.xml`  |
| `ibm-not-wf-P85-ibm85n83.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n83.xml`  |
| `ibm-not-wf-P85-ibm85n84.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n84.xml`  |
| `ibm-not-wf-P85-ibm85n85.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n85.xml`  |
| `ibm-not-wf-P85-ibm85n86.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n86.xml`  |
| `ibm-not-wf-P85-ibm85n87.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n87.xml`  |
| `ibm-not-wf-P85-ibm85n88.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n88.xml`  |
| `ibm-not-wf-P85-ibm85n89.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n89.xml`  |
| `ibm-not-wf-P85-ibm85n90.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n90.xml`  |
| `ibm-not-wf-P85-ibm85n91.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n91.xml`  |
| `ibm-not-wf-P85-ibm85n92.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n92.xml`  |
| `ibm-not-wf-P85-ibm85n93.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n93.xml`  |
| `ibm-not-wf-P85-ibm85n94.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n94.xml`  |
| `ibm-not-wf-P85-ibm85n95.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n95.xml`  |
| `ibm-not-wf-P85-ibm85n96.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n96.xml`  |
| `ibm-not-wf-P85-ibm85n97.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n97.xml`  |
| `ibm-not-wf-P85-ibm85n98.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n98.xml`  |
| `ibm-not-wf-P85-ibm85n99.xml`  | `xmlconf/ibm/not-wf/P85/ibm85n99.xml`  |

</details>

<details>
<summary>Appendix B, production 86, Ideographic: 4 tests</summary>

| Test                          | File                                  |
| ----------------------------- | ------------------------------------- |
| `ibm-not-wf-P86-ibm86n01.xml` | `xmlconf/ibm/not-wf/P86/ibm86n01.xml` |
| `ibm-not-wf-P86-ibm86n02.xml` | `xmlconf/ibm/not-wf/P86/ibm86n02.xml` |
| `ibm-not-wf-P86-ibm86n03.xml` | `xmlconf/ibm/not-wf/P86/ibm86n03.xml` |
| `ibm-not-wf-P86-ibm86n04.xml` | `xmlconf/ibm/not-wf/P86/ibm86n04.xml` |

</details>

<details>
<summary>Appendix B, production 87, CombiningChar: 84 tests</summary>

| Test                          | File                                  |
| ----------------------------- | ------------------------------------- |
| `ibm-not-wf-P87-ibm87n01.xml` | `xmlconf/ibm/not-wf/P87/ibm87n01.xml` |
| `ibm-not-wf-P87-ibm87n02.xml` | `xmlconf/ibm/not-wf/P87/ibm87n02.xml` |
| `ibm-not-wf-P87-ibm87n03.xml` | `xmlconf/ibm/not-wf/P87/ibm87n03.xml` |
| `ibm-not-wf-P87-ibm87n04.xml` | `xmlconf/ibm/not-wf/P87/ibm87n04.xml` |
| `ibm-not-wf-P87-ibm87n05.xml` | `xmlconf/ibm/not-wf/P87/ibm87n05.xml` |
| `ibm-not-wf-P87-ibm87n06.xml` | `xmlconf/ibm/not-wf/P87/ibm87n06.xml` |
| `ibm-not-wf-P87-ibm87n07.xml` | `xmlconf/ibm/not-wf/P87/ibm87n07.xml` |
| `ibm-not-wf-P87-ibm87n08.xml` | `xmlconf/ibm/not-wf/P87/ibm87n08.xml` |
| `ibm-not-wf-P87-ibm87n09.xml` | `xmlconf/ibm/not-wf/P87/ibm87n09.xml` |
| `ibm-not-wf-P87-ibm87n10.xml` | `xmlconf/ibm/not-wf/P87/ibm87n10.xml` |
| `ibm-not-wf-P87-ibm87n11.xml` | `xmlconf/ibm/not-wf/P87/ibm87n11.xml` |
| `ibm-not-wf-P87-ibm87n12.xml` | `xmlconf/ibm/not-wf/P87/ibm87n12.xml` |
| `ibm-not-wf-P87-ibm87n13.xml` | `xmlconf/ibm/not-wf/P87/ibm87n13.xml` |
| `ibm-not-wf-P87-ibm87n14.xml` | `xmlconf/ibm/not-wf/P87/ibm87n14.xml` |
| `ibm-not-wf-P87-ibm87n15.xml` | `xmlconf/ibm/not-wf/P87/ibm87n15.xml` |
| `ibm-not-wf-P87-ibm87n16.xml` | `xmlconf/ibm/not-wf/P87/ibm87n16.xml` |
| `ibm-not-wf-P87-ibm87n17.xml` | `xmlconf/ibm/not-wf/P87/ibm87n17.xml` |
| `ibm-not-wf-P87-ibm87n18.xml` | `xmlconf/ibm/not-wf/P87/ibm87n18.xml` |
| `ibm-not-wf-P87-ibm87n19.xml` | `xmlconf/ibm/not-wf/P87/ibm87n19.xml` |
| `ibm-not-wf-P87-ibm87n20.xml` | `xmlconf/ibm/not-wf/P87/ibm87n20.xml` |
| `ibm-not-wf-P87-ibm87n21.xml` | `xmlconf/ibm/not-wf/P87/ibm87n21.xml` |
| `ibm-not-wf-P87-ibm87n22.xml` | `xmlconf/ibm/not-wf/P87/ibm87n22.xml` |
| `ibm-not-wf-P87-ibm87n23.xml` | `xmlconf/ibm/not-wf/P87/ibm87n23.xml` |
| `ibm-not-wf-P87-ibm87n24.xml` | `xmlconf/ibm/not-wf/P87/ibm87n24.xml` |
| `ibm-not-wf-P87-ibm87n25.xml` | `xmlconf/ibm/not-wf/P87/ibm87n25.xml` |
| `ibm-not-wf-P87-ibm87n26.xml` | `xmlconf/ibm/not-wf/P87/ibm87n26.xml` |
| `ibm-not-wf-P87-ibm87n27.xml` | `xmlconf/ibm/not-wf/P87/ibm87n27.xml` |
| `ibm-not-wf-P87-ibm87n28.xml` | `xmlconf/ibm/not-wf/P87/ibm87n28.xml` |
| `ibm-not-wf-P87-ibm87n29.xml` | `xmlconf/ibm/not-wf/P87/ibm87n29.xml` |
| `ibm-not-wf-P87-ibm87n30.xml` | `xmlconf/ibm/not-wf/P87/ibm87n30.xml` |
| `ibm-not-wf-P87-ibm87n31.xml` | `xmlconf/ibm/not-wf/P87/ibm87n31.xml` |
| `ibm-not-wf-P87-ibm87n32.xml` | `xmlconf/ibm/not-wf/P87/ibm87n32.xml` |
| `ibm-not-wf-P87-ibm87n33.xml` | `xmlconf/ibm/not-wf/P87/ibm87n33.xml` |
| `ibm-not-wf-P87-ibm87n34.xml` | `xmlconf/ibm/not-wf/P87/ibm87n34.xml` |
| `ibm-not-wf-P87-ibm87n35.xml` | `xmlconf/ibm/not-wf/P87/ibm87n35.xml` |
| `ibm-not-wf-P87-ibm87n36.xml` | `xmlconf/ibm/not-wf/P87/ibm87n36.xml` |
| `ibm-not-wf-P87-ibm87n37.xml` | `xmlconf/ibm/not-wf/P87/ibm87n37.xml` |
| `ibm-not-wf-P87-ibm87n38.xml` | `xmlconf/ibm/not-wf/P87/ibm87n38.xml` |
| `ibm-not-wf-P87-ibm87n39.xml` | `xmlconf/ibm/not-wf/P87/ibm87n39.xml` |
| `ibm-not-wf-P87-ibm87n40.xml` | `xmlconf/ibm/not-wf/P87/ibm87n40.xml` |
| `ibm-not-wf-P87-ibm87n41.xml` | `xmlconf/ibm/not-wf/P87/ibm87n41.xml` |
| `ibm-not-wf-P87-ibm87n42.xml` | `xmlconf/ibm/not-wf/P87/ibm87n42.xml` |
| `ibm-not-wf-P87-ibm87n43.xml` | `xmlconf/ibm/not-wf/P87/ibm87n43.xml` |
| `ibm-not-wf-P87-ibm87n44.xml` | `xmlconf/ibm/not-wf/P87/ibm87n44.xml` |
| `ibm-not-wf-P87-ibm87n45.xml` | `xmlconf/ibm/not-wf/P87/ibm87n45.xml` |
| `ibm-not-wf-P87-ibm87n46.xml` | `xmlconf/ibm/not-wf/P87/ibm87n46.xml` |
| `ibm-not-wf-P87-ibm87n47.xml` | `xmlconf/ibm/not-wf/P87/ibm87n47.xml` |
| `ibm-not-wf-P87-ibm87n48.xml` | `xmlconf/ibm/not-wf/P87/ibm87n48.xml` |
| `ibm-not-wf-P87-ibm87n49.xml` | `xmlconf/ibm/not-wf/P87/ibm87n49.xml` |
| `ibm-not-wf-P87-ibm87n50.xml` | `xmlconf/ibm/not-wf/P87/ibm87n50.xml` |
| `ibm-not-wf-P87-ibm87n51.xml` | `xmlconf/ibm/not-wf/P87/ibm87n51.xml` |
| `ibm-not-wf-P87-ibm87n52.xml` | `xmlconf/ibm/not-wf/P87/ibm87n52.xml` |
| `ibm-not-wf-P87-ibm87n53.xml` | `xmlconf/ibm/not-wf/P87/ibm87n53.xml` |
| `ibm-not-wf-P87-ibm87n54.xml` | `xmlconf/ibm/not-wf/P87/ibm87n54.xml` |
| `ibm-not-wf-P87-ibm87n55.xml` | `xmlconf/ibm/not-wf/P87/ibm87n55.xml` |
| `ibm-not-wf-P87-ibm87n56.xml` | `xmlconf/ibm/not-wf/P87/ibm87n56.xml` |
| `ibm-not-wf-P87-ibm87n57.xml` | `xmlconf/ibm/not-wf/P87/ibm87n57.xml` |
| `ibm-not-wf-P87-ibm87n58.xml` | `xmlconf/ibm/not-wf/P87/ibm87n58.xml` |
| `ibm-not-wf-P87-ibm87n59.xml` | `xmlconf/ibm/not-wf/P87/ibm87n59.xml` |
| `ibm-not-wf-P87-ibm87n60.xml` | `xmlconf/ibm/not-wf/P87/ibm87n60.xml` |
| `ibm-not-wf-P87-ibm87n61.xml` | `xmlconf/ibm/not-wf/P87/ibm87n61.xml` |
| `ibm-not-wf-P87-ibm87n62.xml` | `xmlconf/ibm/not-wf/P87/ibm87n62.xml` |
| `ibm-not-wf-P87-ibm87n63.xml` | `xmlconf/ibm/not-wf/P87/ibm87n63.xml` |
| `ibm-not-wf-P87-ibm87n64.xml` | `xmlconf/ibm/not-wf/P87/ibm87n64.xml` |
| `ibm-not-wf-P87-ibm87n66.xml` | `xmlconf/ibm/not-wf/P87/ibm87n66.xml` |
| `ibm-not-wf-P87-ibm87n67.xml` | `xmlconf/ibm/not-wf/P87/ibm87n67.xml` |
| `ibm-not-wf-P87-ibm87n68.xml` | `xmlconf/ibm/not-wf/P87/ibm87n68.xml` |
| `ibm-not-wf-P87-ibm87n69.xml` | `xmlconf/ibm/not-wf/P87/ibm87n69.xml` |
| `ibm-not-wf-P87-ibm87n70.xml` | `xmlconf/ibm/not-wf/P87/ibm87n70.xml` |
| `ibm-not-wf-P87-ibm87n71.xml` | `xmlconf/ibm/not-wf/P87/ibm87n71.xml` |
| `ibm-not-wf-P87-ibm87n72.xml` | `xmlconf/ibm/not-wf/P87/ibm87n72.xml` |
| `ibm-not-wf-P87-ibm87n73.xml` | `xmlconf/ibm/not-wf/P87/ibm87n73.xml` |
| `ibm-not-wf-P87-ibm87n74.xml` | `xmlconf/ibm/not-wf/P87/ibm87n74.xml` |
| `ibm-not-wf-P87-ibm87n75.xml` | `xmlconf/ibm/not-wf/P87/ibm87n75.xml` |
| `ibm-not-wf-P87-ibm87n76.xml` | `xmlconf/ibm/not-wf/P87/ibm87n76.xml` |
| `ibm-not-wf-P87-ibm87n77.xml` | `xmlconf/ibm/not-wf/P87/ibm87n77.xml` |
| `ibm-not-wf-P87-ibm87n78.xml` | `xmlconf/ibm/not-wf/P87/ibm87n78.xml` |
| `ibm-not-wf-P87-ibm87n79.xml` | `xmlconf/ibm/not-wf/P87/ibm87n79.xml` |
| `ibm-not-wf-P87-ibm87n80.xml` | `xmlconf/ibm/not-wf/P87/ibm87n80.xml` |
| `ibm-not-wf-P87-ibm87n81.xml` | `xmlconf/ibm/not-wf/P87/ibm87n81.xml` |
| `ibm-not-wf-P87-ibm87n82.xml` | `xmlconf/ibm/not-wf/P87/ibm87n82.xml` |
| `ibm-not-wf-P87-ibm87n83.xml` | `xmlconf/ibm/not-wf/P87/ibm87n83.xml` |
| `ibm-not-wf-P87-ibm87n84.xml` | `xmlconf/ibm/not-wf/P87/ibm87n84.xml` |
| `ibm-not-wf-P87-ibm87n85.xml` | `xmlconf/ibm/not-wf/P87/ibm87n85.xml` |

</details>

<details>
<summary>Appendix B, production 88, Digit: 13 tests</summary>

| Test                          | File                                  |
| ----------------------------- | ------------------------------------- |
| `ibm-not-wf-P88-ibm88n03.xml` | `xmlconf/ibm/not-wf/P88/ibm88n03.xml` |
| `ibm-not-wf-P88-ibm88n04.xml` | `xmlconf/ibm/not-wf/P88/ibm88n04.xml` |
| `ibm-not-wf-P88-ibm88n05.xml` | `xmlconf/ibm/not-wf/P88/ibm88n05.xml` |
| `ibm-not-wf-P88-ibm88n06.xml` | `xmlconf/ibm/not-wf/P88/ibm88n06.xml` |
| `ibm-not-wf-P88-ibm88n08.xml` | `xmlconf/ibm/not-wf/P88/ibm88n08.xml` |
| `ibm-not-wf-P88-ibm88n09.xml` | `xmlconf/ibm/not-wf/P88/ibm88n09.xml` |
| `ibm-not-wf-P88-ibm88n10.xml` | `xmlconf/ibm/not-wf/P88/ibm88n10.xml` |
| `ibm-not-wf-P88-ibm88n11.xml` | `xmlconf/ibm/not-wf/P88/ibm88n11.xml` |
| `ibm-not-wf-P88-ibm88n12.xml` | `xmlconf/ibm/not-wf/P88/ibm88n12.xml` |
| `ibm-not-wf-P88-ibm88n13.xml` | `xmlconf/ibm/not-wf/P88/ibm88n13.xml` |
| `ibm-not-wf-P88-ibm88n14.xml` | `xmlconf/ibm/not-wf/P88/ibm88n14.xml` |
| `ibm-not-wf-P88-ibm88n15.xml` | `xmlconf/ibm/not-wf/P88/ibm88n15.xml` |
| `ibm-not-wf-P88-ibm88n16.xml` | `xmlconf/ibm/not-wf/P88/ibm88n16.xml` |

</details>

<details>
<summary>Appendix B, production 89, Extender: 10 tests</summary>

| Test                          | File                                  |
| ----------------------------- | ------------------------------------- |
| `ibm-not-wf-P89-ibm89n03.xml` | `xmlconf/ibm/not-wf/P89/ibm89n03.xml` |
| `ibm-not-wf-P89-ibm89n04.xml` | `xmlconf/ibm/not-wf/P89/ibm89n04.xml` |
| `ibm-not-wf-P89-ibm89n05.xml` | `xmlconf/ibm/not-wf/P89/ibm89n05.xml` |
| `ibm-not-wf-P89-ibm89n06.xml` | `xmlconf/ibm/not-wf/P89/ibm89n06.xml` |
| `ibm-not-wf-P89-ibm89n07.xml` | `xmlconf/ibm/not-wf/P89/ibm89n07.xml` |
| `ibm-not-wf-P89-ibm89n08.xml` | `xmlconf/ibm/not-wf/P89/ibm89n08.xml` |
| `ibm-not-wf-P89-ibm89n09.xml` | `xmlconf/ibm/not-wf/P89/ibm89n09.xml` |
| `ibm-not-wf-P89-ibm89n10.xml` | `xmlconf/ibm/not-wf/P89/ibm89n10.xml` |
| `ibm-not-wf-P89-ibm89n11.xml` | `xmlconf/ibm/not-wf/P89/ibm89n11.xml` |
| `ibm-not-wf-P89-ibm89n12.xml` | `xmlconf/ibm/not-wf/P89/ibm89n12.xml` |

</details>

<details>
<summary>Names in section 2.3: 5 tests</summary>

| Test            | File                                |
| --------------- | ----------------------------------- |
| `not-wf-sa-140` | `xmlconf/xmltest/not-wf/sa/140.xml` |
| `not-wf-sa-141` | `xmlconf/xmltest/not-wf/sa/141.xml` |
| `rmt-014`       | `xmlconf/eduni/xml-1.1/014.xml`     |
| `rmt-016`       | `xmlconf/eduni/xml-1.1/016.xml`     |
| `rmt-019`       | `xmlconf/eduni/xml-1.1/019.xml`     |

</details>

<details>
<summary>Version numbers: 1 test</summary>

| Test        | File                              |
| ----------- | --------------------------------- |
| `x-rmt-008` | `xmlconf/eduni/errata-4e/008.xml` |

</details>

### DOM suite: 87 tests that need XML Schema

These tests ask for a document validated against an XML Schema, and then for the types the schema gives elements and attributes. exemplar validates against DTDs only, so the test builder refuses the request, and the test is skipped.

```js
setImplementationAttribute('schemaValidating', true); // exemplar has no XML Schema validator
// …
elemTypeInfo = doc.getElementsByTagName('em').item(0).schemaTypeInfo;
assertEquals('typeinfogettypename04_1', 'emType', elemTypeInfo.typeName);
// emType is a type that only files/hc_staff.xsd defines
```

Each of these pages calls `setImplementationAttribute("schemaValidating", true)`. They will run once exemplar validates against XML Schema.

<details>
<summary>87 tests</summary>

| Test                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- |
| [`attrgetschematypeinfo03`](https://www.w3.org/2004/04/ecmascript/level3/core/attrgetschematypeinfo03.html)         |
| [`attrgetschematypeinfo04`](https://www.w3.org/2004/04/ecmascript/level3/core/attrgetschematypeinfo04.html)         |
| [`attrgetschematypeinfo05`](https://www.w3.org/2004/04/ecmascript/level3/core/attrgetschematypeinfo05.html)         |
| [`attrgetschematypeinfo07`](https://www.w3.org/2004/04/ecmascript/level3/core/attrgetschematypeinfo07.html)         |
| [`attrgetschematypeinfo08`](https://www.w3.org/2004/04/ecmascript/level3/core/attrgetschematypeinfo08.html)         |
| [`documentnormalizedocument12`](https://www.w3.org/2004/04/ecmascript/level3/core/documentnormalizedocument12.html) |
| [`elementgetschematypeinfo02`](https://www.w3.org/2004/04/ecmascript/level3/core/elementgetschematypeinfo02.html)   |
| [`elementgetschematypeinfo04`](https://www.w3.org/2004/04/ecmascript/level3/core/elementgetschematypeinfo04.html)   |
| [`elementgetschematypeinfo05`](https://www.w3.org/2004/04/ecmascript/level3/core/elementgetschematypeinfo05.html)   |
| [`elementgetschematypeinfo06`](https://www.w3.org/2004/04/ecmascript/level3/core/elementgetschematypeinfo06.html)   |
| [`elementgetschematypeinfo07`](https://www.w3.org/2004/04/ecmascript/level3/core/elementgetschematypeinfo07.html)   |
| [`typeinfogettypename03`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfogettypename03.html)             |
| [`typeinfogettypename04`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfogettypename04.html)             |
| [`typeinfogettypenamespace01`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfogettypenamespace01.html)   |
| [`typeinfogettypenamespace03`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfogettypenamespace03.html)   |
| [`typeinfogettypenamespace04`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfogettypenamespace04.html)   |
| [`typeinfoisderivedfrom02`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom02.html)         |
| [`typeinfoisderivedfrom03`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom03.html)         |
| [`typeinfoisderivedfrom04`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom04.html)         |
| [`typeinfoisderivedfrom05`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom05.html)         |
| [`typeinfoisderivedfrom06`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom06.html)         |
| [`typeinfoisderivedfrom07`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom07.html)         |
| [`typeinfoisderivedfrom08`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom08.html)         |
| [`typeinfoisderivedfrom09`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom09.html)         |
| [`typeinfoisderivedfrom10`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom10.html)         |
| [`typeinfoisderivedfrom11`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom11.html)         |
| [`typeinfoisderivedfrom12`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom12.html)         |
| [`typeinfoisderivedfrom13`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom13.html)         |
| [`typeinfoisderivedfrom14`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom14.html)         |
| [`typeinfoisderivedfrom15`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom15.html)         |
| [`typeinfoisderivedfrom16`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom16.html)         |
| [`typeinfoisderivedfrom17`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom17.html)         |
| [`typeinfoisderivedfrom18`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom18.html)         |
| [`typeinfoisderivedfrom19`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom19.html)         |
| [`typeinfoisderivedfrom20`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom20.html)         |
| [`typeinfoisderivedfrom21`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom21.html)         |
| [`typeinfoisderivedfrom22`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom22.html)         |
| [`typeinfoisderivedfrom23`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom23.html)         |
| [`typeinfoisderivedfrom24`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom24.html)         |
| [`typeinfoisderivedfrom25`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom25.html)         |
| [`typeinfoisderivedfrom26`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom26.html)         |
| [`typeinfoisderivedfrom27`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom27.html)         |
| [`typeinfoisderivedfrom28`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom28.html)         |
| [`typeinfoisderivedfrom29`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom29.html)         |
| [`typeinfoisderivedfrom30`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom30.html)         |
| [`typeinfoisderivedfrom31`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom31.html)         |
| [`typeinfoisderivedfrom32`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom32.html)         |
| [`typeinfoisderivedfrom33`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom33.html)         |
| [`typeinfoisderivedfrom34`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom34.html)         |
| [`typeinfoisderivedfrom35`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom35.html)         |
| [`typeinfoisderivedfrom36`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom36.html)         |
| [`typeinfoisderivedfrom37`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom37.html)         |
| [`typeinfoisderivedfrom38`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom38.html)         |
| [`typeinfoisderivedfrom39`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom39.html)         |
| [`typeinfoisderivedfrom40`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom40.html)         |
| [`typeinfoisderivedfrom41`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom41.html)         |
| [`typeinfoisderivedfrom42`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom42.html)         |
| [`typeinfoisderivedfrom43`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom43.html)         |
| [`typeinfoisderivedfrom44`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom44.html)         |
| [`typeinfoisderivedfrom45`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom45.html)         |
| [`typeinfoisderivedfrom46`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom46.html)         |
| [`typeinfoisderivedfrom47`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom47.html)         |
| [`typeinfoisderivedfrom48`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom48.html)         |
| [`typeinfoisderivedfrom49`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom49.html)         |
| [`typeinfoisderivedfrom50`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom50.html)         |
| [`typeinfoisderivedfrom51`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom51.html)         |
| [`typeinfoisderivedfrom52`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom52.html)         |
| [`typeinfoisderivedfrom53`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom53.html)         |
| [`typeinfoisderivedfrom54`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom54.html)         |
| [`typeinfoisderivedfrom55`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom55.html)         |
| [`typeinfoisderivedfrom56`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom56.html)         |
| [`typeinfoisderivedfrom57`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom57.html)         |
| [`typeinfoisderivedfrom58`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom58.html)         |
| [`typeinfoisderivedfrom59`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom59.html)         |
| [`typeinfoisderivedfrom60`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom60.html)         |
| [`typeinfoisderivedfrom61`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom61.html)         |
| [`typeinfoisderivedfrom62`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom62.html)         |
| [`typeinfoisderivedfrom64`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom64.html)         |
| [`typeinfoisderivedfrom65`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom65.html)         |
| [`typeinfoisderivedfrom66`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom66.html)         |
| [`typeinfoisderivedfrom67`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom67.html)         |
| [`typeinfoisderivedfrom68`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom68.html)         |
| [`typeinfoisderivedfrom69`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom69.html)         |
| [`typeinfoisderivedfrom70`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom70.html)         |
| [`typeinfoisderivedfrom71`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom71.html)         |
| [`typeinfoisderivedfrom72`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom72.html)         |
| [`typeinfoisderivedfrom73`](https://www.w3.org/2004/04/ecmascript/level3/core/typeinfoisderivedfrom73.html)         |

</details>

### XInclude suite: 21 tests

**15 use the `xpointer()` scheme**, which selects parts of a document with XPath expressions. exemplar supports the `element()` scheme and shorthand pointers, and `xpointer()` waits for XPath.

```xml
<xinclude:include href="../ents/books.xml" xpointer="xpointer(//chapter)"/>
```

| Test                     | File                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `imaq-include-xml-03`    | `XIncl20060927/Imaq/test/XInclude/docs/nodes.xml`              |
| `FourThought-include-04` | `XIncl20060927/FourThought/test/XInclude/docs/ft-include4.xml` |
| `FourThought-include-05` | `XIncl20060927/FourThought/test/XInclude/docs/ft-include5.xml` |
| `FourThought-include-06` | `XIncl20060927/FourThought/test/XInclude/docs/ft-include6.xml` |
| `FourThought-include-07` | `XIncl20060927/FourThought/test/XInclude/docs/ft-include7.xml` |
| `Nist-include-18`        | `XIncl20060927/Nist/test/docs/nist-include-18.xml`             |
| `Nist-include-19`        | `XIncl20060927/Nist/test/docs/nist-include-19.xml`             |
| `Nist-include-20`        | `XIncl20060927/Nist/test/docs/nist-include-20.xml`             |
| `Nist-include-23`        | `XIncl20060927/Nist/test/docs/nist-include-23.xml`             |
| `Nist-include-24`        | `XIncl20060927/Nist/test/docs/nist-include-24.xml`             |
| `Nist-include-25`        | `XIncl20060927/Nist/test/docs/nist-include-25.xml`             |
| `Nist-include-51`        | `XIncl20060927/Nist/test/docs/nist-include-51.xml`             |
| `Nist-include-52`        | `XIncl20060927/Nist/test/docs/nist-include-52.xml`             |
| `Nist-include-53`        | `XIncl20060927/Nist/test/docs/nist-include-53.xml`             |
| `Nist-include-54`        | `XIncl20060927/Nist/test/docs/nist-include-54.xml`             |

**2 expect an entity reference to stay unexpanded** in the result. The suite's expected output keeps `&e;` as a reference, but exemplar's results are compared in a canonical form, and every canonical form expands references, so the two cannot be compared. `Nist-include-48` also uses `xpointer()`.

```xml
<!-- the expected result of Nist-include-49 -->
<doc xml:base="../ents/extref.xml">&e;</doc>
```

| Test              | File                                               |
| ----------------- | -------------------------------------------------- |
| `Nist-include-48` | `XIncl20060927/Nist/test/docs/nist-include-48.xml` |
| `Nist-include-49` | `XIncl20060927/Nist/test/docs/nist-include-49.xml` |

**4 ask a live web server for a language or media type**, through `accept` and `accept-language`. The runner reads only the suite's own files, so it cannot reproduce what the server answers.

```xml
<xi:include href="http://www.cafeconleche.org/tests/data.txt" parse="text" accept-language="fr"/>
```

| Test        | File                                            |
| ----------- | ----------------------------------------------- |
| `harold-87` | `XIncl20060927/Harold/test/acceptfrench.xml`    |
| `harold-88` | `XIncl20060927/Harold/test/acceptenglish.xml`   |
| `harold-89` | `XIncl20060927/Harold/test/acceptplaintext.xml` |
| `harold-90` | `XIncl20060927/Harold/test/accepthtml.xml`      |

### `xml:id` suite: 2 tests that need XML Schema

These declare `xml:id` in an XML Schema and expect the schema's type to be checked. The suite's notes say they need a schema-aware processor.

| Test         | File                         |
| ------------ | ---------------------------- |
| `declar_002` | `tests/004_schema.xml`       |
| `baddcl_002` | `tests/006_errschemabad.xml` |

### Canonical XML: the examples and cases that need XPath

The Canonical XML examples run as unit tests, from the recommendations' own text, and the cases below wait for XPath, because each one canonicalizes a part of a document that an XPath expression selects:

- example 3.7, Document Subsets, of Canonical XML 1.0 (`https://www.w3.org/TR/2001/REC-xml-c14n-20010315`) and of Canonical XML 1.1 (`https://www.w3.org/TR/xml-c14n11/`), and 1.1's example 3.8, Document Subsets and XML Attributes;
- the examples of Exclusive XML Canonicalization (`https://www.w3.org/TR/xml-exc-c14n/`);
- the 21 Canonical XML 1.1 cases in section 3.2 of `https://www.w3.org/TR/xmldsig2ed-tests/`: `c14n11/xmllang-1` to `-4`, `c14n11/xmlspace-1` to `-4`, `c14n11/xmlid-1` and `-2`, `c14n11/xmlbase-prop-1` to `-7`, `c14n11/xmlbase-c14n11spec-102`, `c14n11/xmlbase-c14n11spec2-102`, `c14n11/xmlbase-c14n11spec3-103` and `c14n11/xmlbase-annexa`.

They count in no report, since no suite runs them.

## Catalogue corrections

### XML suite: 2 tests whose index names the wrong section

Under `validating`, an invalid test must report a validity error from a section or production its index entry's `SECTIONS` names. In these two, the index names a part of the spec the document does not break, so the runner checks each against the section of the constraint it does break, which is the one exemplar reports. `SECTION_CORRECTIONS` in [`src/verdict.ts`](src/verdict.ts) holds the corrected sections.

```xml
<!-- ibm41i02.xml: attr3 is fixed, so its only allowed value is "fixed" -->
<!ATTLIST b attr3 CDATA #FIXED "fixed">
<b attr1="value1" attr2="abc" attr3="shoudbefixed">attr3 value not fixed</b>
```

| Test                           | File                                   | Index entry                                  | Index names                          | Corrected to, the constraint the document breaks                                                                 |
| ------------------------------ | -------------------------------------- | -------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `ibm-invalid-P41-ibm41i02.xml` | `xmlconf/ibm/invalid/P41/ibm41i02.xml` | `xmlconf/ibm/ibm_oasis_invalid.xml`, line 75 | 3.1, Attribute Value Type            | Fixed Attribute Default (3.3.2): `attr3` is `#FIXED "fixed"` but given another value, which is still valid CDATA |
| `o-p75pass1`                   | `xmlconf/oasis/p75pass1.xml`           | `xmlconf/oasis/oasis.xml`, line 460          | 4.2.2 and [75], external identifiers | Element Valid (3): the DTD declares no element, so `<doc/>` is undeclared                                        |
