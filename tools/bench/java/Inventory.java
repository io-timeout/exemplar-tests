import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;

/**
 * Checks benchmark documents with the JDK's Xerces, read as the benchmarks read them: namespace-aware, without the
 * external DTD or entities, under JDK 24's limits. Each stdin line is a path; each stdout line is "ok" or the error.
 */
public final class Inventory {
  /** JDK 24's default limits, set here so that any JDK checks under the same ones. */
  private static final Map<String, String> LIMITS = Map.of(
      "jdk.xml.entityExpansionLimit", "2500",
      "jdk.xml.totalEntitySizeLimit", "100000",
      "jdk.xml.maxGeneralEntitySizeLimit", "100000",
      "jdk.xml.maxParameterEntitySizeLimit", "15000",
      "jdk.xml.entityReplacementLimit", "100000",
      "jdk.xml.elementAttributeLimit", "200",
      "jdk.xml.maxElementDepth", "100",
      "jdk.xml.maxXMLNameLimit", "1000");

  public static void main(String[] args) throws Exception {
    LIMITS.forEach(System::setProperty);
    var factory = SAXParserFactory.newInstance();
    factory.setNamespaceAware(true);
    var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    var out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    for (String line = in.readLine(); line != null; line = in.readLine()) out.println(check(factory, line));
  }

  /** Parses one document; recoverable errors and warnings are ignored, as the benchmarks' reference ignores them. */
  static String check(SAXParserFactory factory, String file) {
    try {
      XMLReader reader = factory.newSAXParser().getXMLReader();
      reader.setFeature("http://xml.org/sax/features/external-general-entities", false);
      reader.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
      reader.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
      reader.setErrorHandler(new DefaultHandler());
      reader.parse(new InputSource(Path.of(file).toUri().toString()));
      return "ok";
    } catch (SAXParseException e) {
      return oneLine(e.getMessage()) + " (line " + e.getLineNumber() + ")";
    } catch (Exception | StackOverflowError e) {
      return oneLine(e.toString());
    }
  }

  /** The message on one line, so that each answer is one line. */
  static String oneLine(String message) {
    return String.valueOf(message).replaceAll("\\s+", " ").trim();
  }
}
