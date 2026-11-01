import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.io.StringReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import javax.xml.parsers.SAXParser;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;
import org.xml.sax.XMLReader;
import org.xml.sax.ext.DefaultHandler2;
import org.xml.sax.ext.Locator2;

/**
 * Parses documents with the JDK's Xerces for exemplar's differential tests. Each stdin line is
 * configuration, namespace awareness, root directory and path, tab-separated; each stdout line is a JSON result.
 */
public final class XercesHarness {
  private XercesHarness() {}

  public static void main(String[] args) throws Exception {
    var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    var out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    for (String line = in.readLine(); line != null; line = in.readLine()) {
      String[] fields = line.split("\t", 4);
      out.println(parse(fields[0], Boolean.parseBoolean(fields[1]), Path.of(fields[2]), fields[3]));
    }
  }

  /** Parses one document under a configuration and returns its result as JSON. */
  static String parse(String configuration, boolean namespaces, Path root, String file) {
    var writer = new CanonicalWriter(root.toAbsolutePath().normalize());
    try {
      var factory = SAXParserFactory.newInstance();
      factory.setNamespaceAware(namespaces);
      factory.setValidating(configuration.equals("validating"));
      SAXParser parser = factory.newSAXParser();
      XMLReader reader = parser.getXMLReader();
      boolean external = !configuration.equals("standalone");
      reader.setFeature("http://xml.org/sax/features/external-general-entities", external);
      reader.setFeature("http://xml.org/sax/features/external-parameter-entities", external);
      reader.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", external);
      reader.setFeature("http://xml.org/sax/features/resolve-dtd-uris", false);
      if (namespaces) reader.setFeature("http://xml.org/sax/features/namespace-prefixes", true);
      reader.setProperty("http://xml.org/sax/properties/lexical-handler", writer);
      reader.setProperty("http://xml.org/sax/properties/declaration-handler", writer);
      reader.setContentHandler(writer);
      reader.setDTDHandler(writer);
      reader.setErrorHandler(writer);
      reader.setEntityResolver(writer);
      reader.parse(new InputSource(Path.of(file).toUri().toString()));
      return "{\"accepted\":true,\"validityErrors\":" + writer.validityErrors + ",\"canonical\":" + json(writer.result()) + "}";
    } catch (SAXParseException e) {
      return "{\"accepted\":false,\"message\":" + json(String.valueOf(e.getMessage())) + ",\"line\":" + e.getLineNumber()
          + ",\"column\":" + e.getColumnNumber() + ",\"systemId\":" + json(String.valueOf(e.getSystemId())) + "}";
    } catch (Exception | StackOverflowError e) {
      return "{\"accepted\":false,\"message\":" + json(e.toString()) + "}";
    }
  }

  /** Writes a JSON string literal. */
  static String json(String s) {
    var out = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') out.append('\\').append(c);
      else if (c < 0x20 || c > 0x7e) out.append(String.format("\\u%04x", (int) c));
      else out.append(c);
    }
    return out.append('"').toString();
  }

  /** Writes the XML Test Suite's second canonical form, and confines external reads to the root directory. */
  static final class CanonicalWriter extends DefaultHandler2 {
    final Path root;
    final StringBuilder out = new StringBuilder();
    final TreeMap<String, String[]> notations = new TreeMap<>();
    int depth = 0;
    int rootAt = -1;
    String rootName = "";
    int validityErrors = 0;
    Locator2 locator;
    /** The document's version, read while the locator still knows it. */
    String version;

    CanonicalWriter(Path root) {
      this.root = root;
    }

    @Override
    public void setDocumentLocator(org.xml.sax.Locator locator) {
      if (locator instanceof Locator2 l) this.locator = l;
    }

    boolean version11() {
      if (version == null && locator != null) version = locator.getXMLVersion();
      return "1.1".equals(version);
    }

    String result() {
      var doctype = new StringBuilder();
      if (!notations.isEmpty()) {
        doctype.append("<!DOCTYPE ").append(rootName).append(" [\n");
        for (var entry : notations.entrySet()) {
          String publicId = entry.getValue()[0];
          String systemId = entry.getValue()[1];
          doctype.append("<!NOTATION ").append(entry.getKey());
          if (publicId == null) doctype.append(" SYSTEM '").append(systemId == null ? "" : systemId).append("'");
          else if (systemId == null) doctype.append(" PUBLIC '").append(publicId).append("'");
          else doctype.append(" PUBLIC '").append(publicId).append("' '").append(systemId).append("'");
          doctype.append(">\n");
        }
        doctype.append("]>\n");
      }
      int split = Math.max(0, rootAt);
      String declaration = version11() ? "<?xml version=\"1.1\"?>" : "";
      return declaration + out.substring(0, split) + doctype + out.substring(split);
    }

    void escape(String text) {
      boolean v11 = version11();
      for (int i = 0; i < text.length(); i++) {
        char c = text.charAt(i);
        switch (c) {
          case '&' -> out.append("&amp;");
          case '<' -> out.append("&lt;");
          case '>' -> out.append("&gt;");
          case '"' -> out.append("&quot;");
          case '\t' -> out.append("&#9;");
          case '\n' -> out.append("&#10;");
          case '\r' -> out.append("&#13;");
          default -> {
            if (v11 && ((c >= 0x01 && c <= 0x1f) || (c >= 0x7f && c <= 0x9f))) out.append("&#").append((int) c).append(';');
            else out.append(c);
          }
        }
      }
    }

    @Override
    public void startElement(String uri, String local, String qName, Attributes attributes) {
      version11();
      if (depth == 0 && rootAt == -1) {
        rootAt = out.length();
        rootName = qName;
      }
      List<String[]> sorted = new ArrayList<>();
      for (int i = 0; i < attributes.getLength(); i++) sorted.add(new String[] {attributes.getQName(i), attributes.getValue(i)});
      sorted.sort((a, b) -> a[0].compareTo(b[0]));
      out.append('<').append(qName);
      for (String[] attribute : sorted) {
        out.append(' ').append(attribute[0]).append("=\"");
        escape(attribute[1]);
        out.append('"');
      }
      out.append('>');
      depth++;
    }

    @Override
    public void endElement(String uri, String local, String qName) {
      out.append("</").append(qName).append('>');
      depth--;
    }

    @Override
    public void characters(char[] ch, int start, int length) {
      if (depth > 0) escape(new String(ch, start, length));
    }

    @Override
    public void ignorableWhitespace(char[] ch, int start, int length) {
      characters(ch, start, length);
    }

    @Override
    public void processingInstruction(String target, String data) {
      out.append("<?").append(target).append(' ').append(data == null ? "" : data).append("?>");
    }

    @Override
    public void notationDecl(String name, String publicId, String systemId) {
      notations.put(name, new String[] {publicId, systemId});
    }

    @Override
    public void error(SAXParseException e) {
      validityErrors++;
    }

    @Override
    public void fatalError(SAXParseException e) throws SAXParseException {
      throw e;
    }

    @Override
    public InputSource resolveEntity(String name, String publicId, String baseURI, String systemId) {
      try {
        URI uri = baseURI == null ? new URI(systemId) : new URI(baseURI).resolve(systemId);
        if ("file".equals(uri.getScheme()) && Path.of(uri).toAbsolutePath().normalize().startsWith(root)) {
          return new InputSource(uri.toString());
        }
      } catch (Exception e) {
        // Anything that does not resolve to a file below the root reads as empty.
      }
      var empty = new InputSource(new StringReader(""));
      empty.setSystemId(systemId);
      return empty;
    }
  }
}
