import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import javax.xml.catalog.CatalogFeatures;
import javax.xml.catalog.CatalogManager;
import javax.xml.catalog.CatalogResolver;

/**
 * Resolves identifiers with the JDK's javax.xml.catalog for exemplar's differential tests. Each stdin line is
 * prefer, defer, catalog files (space-separated), kind (entity or uri), public id, system id or href, and base,
 * tab-separated, with "-" for none; each stdout line is "match URI", "none" or "error MESSAGE".
 */
public final class CatalogHarness {
  private CatalogHarness() {}

  public static void main(String[] args) throws Exception {
    var in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    var out = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    Map<String, CatalogResolver> resolvers = new HashMap<>();
    for (String line = in.readLine(); line != null; line = in.readLine()) {
      String[] f = line.split("\t", -1);
      out.println(resolve(resolvers, f[0], f[1], f[2], f[3], none(f[4]), none(f[5]), none(f[6])));
    }
  }

  static String none(String field) {
    return field.equals("-") ? null : field;
  }

  /** Resolves one query; strict resolution tells a match from none. */
  static String resolve(Map<String, CatalogResolver> resolvers, String prefer, String defer, String files,
      String kind, String publicId, String id, String base) {
    try {
      CatalogResolver resolver = resolvers.computeIfAbsent(prefer + "\t" + defer + "\t" + files, key -> {
        CatalogFeatures features = CatalogFeatures.builder()
            .with(CatalogFeatures.Feature.PREFER, prefer)
            .with(CatalogFeatures.Feature.DEFER, defer)
            .with(CatalogFeatures.Feature.RESOLVE, "strict")
            .build();
        String[] list = files.split(" ");
        URI[] uris = new URI[list.length];
        for (int i = 0; i < list.length; i++) uris[i] = URI.create(list[i]);
        return CatalogManager.catalogResolver(features, uris);
      });
      // An empty system id stands for none, which resolveEntity does not accept.
      String result = kind.equals("entity")
          ? resolver.resolveEntity(publicId, id == null ? "" : id).getSystemId()
          : resolver.resolve(id, base).getSystemId();
      return "match " + result;
    } catch (Exception e) {
      String message = String.valueOf(e.getMessage());
      return message.contains("No match") ? "none" : "error " + message.replaceAll("\\s+", " ");
    }
  }
}
