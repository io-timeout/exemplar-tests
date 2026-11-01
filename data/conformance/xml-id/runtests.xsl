<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                version="1.0">

<xsl:output method="html" encoding="utf-8"/>

<xsl:strip-space elements="*"/>

<xsl:param name="schema" select="0"/>
<xsl:param name="xml11" select="0"/>

<xsl:param name="product" select="''"/>

<xsl:template match="test-suite">
  <xsl:if test="$product = ''">
    <xsl:message terminate="yes">
      <xsl:text>Please specify a $product parameter.</xsl:text>
    </xsl:message>
  </xsl:if>

  <html>
    <head>
      <title>
	<xsl:text>xml:id Test Suite for </xsl:text>
	<xsl:value-of select="$product"/>
      </title>
      <style type="text/css">
tr.FAIL { background-color: #FF9999; }
tr.pass { background-color: #99FF99; }
tr.ques { background-color: #FFFF99; }
span.title { font-size: x-large; }
div.test-detail { margin-left: 0.5in; }
div.test-detail
div.title       { margin-left: -0.5in; }
      </style>
    </head>
    <body>
      <h1>
	<xsl:text>xml:id Test Suite for </xsl:text>
	<xsl:value-of select="$product"/>
      </h1>

<p>This document is the output of
<a href="runtests.xsl">runtests.xsl</a> applied to
<a href="test-suite.xml">test-suite.xml</a>.
See also, the
<a href="http://www.w3.org/XML/Test/xml-id/">xml:id Conformance Test
Suite</a>.</p>

      <xsl:apply-templates/>
    </body>
  </html>
</xsl:template>

<xsl:template match="test-catalog">
  <div class="catalog">
    <h2>
      <xsl:value-of select="@submitter"/>
      <xsl:text> Catalog&#10;&#10;</xsl:text>
    </h2>

    <table border="0" cellpadding="3" cellspacing="0">
      <tbody>
	<xsl:apply-templates/>
      </tbody>
    </table>

    <xsl:if test=".//notes">
      <div class="notes">
	<h3>Notes</h3>
	<xsl:for-each select=".//notes">
	  <div>
	    <a name="note-{generate-id(ancestor::test-catalog)}-{position}"/>
	    <xsl:text>[</xsl:text>
	    <xsl:value-of select="position()"/>
	    <xsl:text>] </xsl:text>
	    <xsl:value-of select="."/>
	  </div>
	</xsl:for-each>
      </div>
    </xsl:if>

    <div class="details">
      <h3>Test Details</h3>

      <xsl:for-each select="test-case">
	<div class="test-detail">
	  <div class="title">
	    <span class="title">
	      <a name="{generate-id()}" href="http://www.w3.org/XML/2005/01/{file-path}/{scenario/input-file}">
		<xsl:value-of select="@id"/>
	      </a>
	    </span>
	    <span> (</span>
	    <span class="creator">
	      <xsl:value-of select="creator"/>
	    </span>
	    <span>, </span>
	    <span class="date">
	      <xsl:value-of select="date"/>
	    </span>
	  </div>
	  <p>Purpose: <xsl:value-of select="purpose"/></p>
	  <xsl:if test="scenario/notes">
	    <p>Notes: <xsl:value-of select="scenario/notes"/></p>
	  </xsl:if>
	</div>
      </xsl:for-each>
    </div>
  </div>
</xsl:template>

<xsl:template match="test-case">
  <xsl:variable name="path" select="file-path"/>
  <xsl:variable name="name" select="scenario/input-file"/>

  <xsl:variable name="result">
    <xsl:apply-templates select="document(concat($path,'/',$name),.)/*"/>
  </xsl:variable>

  <xsl:variable name="pass">
    <xsl:choose>
      <xsl:when test="$result = scenario/result">
	<xsl:text>pass</xsl:text>
      </xsl:when>
      <xsl:otherwise>
	<xsl:text>FAIL</xsl:text>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <xsl:variable name="class">
    <xsl:choose>
      <xsl:when test="@feature = 'schema' and $schema = 0">
	<xsl:text>ques</xsl:text>
      </xsl:when>
      <xsl:when test="@feature = 'xml11' and $xml11 = 0">
	<xsl:text>ques</xsl:text>
      </xsl:when>
      <xsl:otherwise>
	<xsl:value-of select="$pass"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:variable>

  <tr class="{$class}">
    <td>
      <xsl:text>Test: </xsl:text>
      <a href="#{generate-id()}">
	<xsl:value-of select="@id"/>
      </a>
      <xsl:if test="scenario/notes">
	<xsl:text>[</xsl:text>
	<a href="#note-{generate-id(ancestor::test-catalog)}-{count(preceding::notes)+1}">
	  <xsl:value-of select="count(preceding::notes)+1"/>
	</a>
	<xsl:text>]</xsl:text>
      </xsl:if>
      <xsl:text> </xsl:text>
    </td>
    <td>
      <xsl:value-of select="$pass"/>

      <xsl:if test="$pass = 'FAIL'">
	<br/>
	<xsl:text>Expect: “</xsl:text>
	<xsl:value-of select="scenario/result"/>
	<xsl:text>”</xsl:text>
	<br/>
	<xsl:text>Result: “</xsl:text>
	<xsl:value-of select="$result"/>
	<xsl:text>”</xsl:text>
      </xsl:if>
    </td>
  </tr>
</xsl:template>

<xsl:template match="*">
  <xsl:variable name="node" select="."/>
  <xsl:for-each select="@*">
    <xsl:sort select="name(.)" order="ascending" data-type="text"/>

    <xsl:message>
      <xsl:text>Test </xsl:text>
      <xsl:value-of select="name(.)"/>
      <xsl:text> on </xsl:text>
      <xsl:value-of select="name($node)"/>
      <xsl:text> ('</xsl:text>
      <xsl:value-of select="."/>
      <xsl:text>', </xsl:text>
      <xsl:value-of select="count(id(string(.)))"/>
      <xsl:text>, </xsl:text>
      <xsl:value-of select="generate-id(id(.))"/>
      <xsl:text>, </xsl:text>
      <xsl:value-of select="generate-id($node)"/>
      <xsl:text>)</xsl:text>
    </xsl:message>

    <xsl:if test="generate-id(id(.)) = generate-id($node)">
      <xsl:value-of select="name(.)"/>
      <xsl:text> on </xsl:text>
      <xsl:value-of select="name($node)"/>
      <xsl:text> is an ID (</xsl:text>
      <xsl:value-of select="."/>
      <xsl:text>) </xsl:text>
    </xsl:if>

    <xsl:if test="name(.) = 'ref'">
      <xsl:choose>
	<xsl:when test="id(.)">
	  <xsl:text>Found </xsl:text>
	  <xsl:value-of select="name(id(.))"/>
	  <xsl:text> </xsl:text>
	</xsl:when>
	<xsl:otherwise>
	  <xsl:text>Found no element with id </xsl:text>
	  <xsl:value-of select="."/>
	  <xsl:text> </xsl:text>
	</xsl:otherwise>
      </xsl:choose>
    </xsl:if>
  </xsl:for-each>
  <xsl:apply-templates/>
</xsl:template>

<xsl:template match="comment()|processing-instruction()|text()">
  <!-- nop -->
</xsl:template>

</xsl:stylesheet>
