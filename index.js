const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const NOTION_VERSION = "2022-06-28";

// ✅ Create Database Endpoint
app.post("/create-database", async (req, res) => {
  try {
    const { page_id, title, properties } = req.body;
    const notionToken = req.headers["notion-token"]; // raw token from headers

    if (!notionToken) {
      return res.status(401).json({ error: "Notion token missing in headers" });
    }

    if (!page_id || !title || !properties) {
      return res
        .status(400)
        .json({ error: "page_id, title, and properties are required" });
    }

    const payload = {
      parent: { type: "page_id", page_id },
      title: [
        {
          type: "text",
          text: { content: title },
        },
      ],
      properties: {},
    };

    // ✅ Dynamically build properties
    for (const [key, type] of Object.entries(properties)) {
      payload.properties[key] = { [type]: {} };
    }

    const response = await axios.post(
      "https://api.notion.com/v1/databases",
      payload,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
        success: true,
        database_id: response.data.id,
        title: response.data.title[0]?.plain_text,
        url: response.data.url
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res
      .status(500)
      .json({ error: error.response?.data || error.message });
  }
});




// ✅ Create a new page in a database (Auto type detection)

app.post("/create-page", async (req, res) => {
  try {
    const { database_id, properties } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!database_id || !properties) {
      return res.status(400).json({ success: false, message: "database_id and properties are required" });
    }

    // ✅ Fetch database schema first
    const dbResponse = await axios.get(
      `https://api.notion.com/v1/databases/${database_id}`,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
        },
      }
    );

    const dbProperties = dbResponse.data.properties;
    const formattedProperties = {};

    // ✅ Format properties dynamically based on DB schema
    for (const [key, value] of Object.entries(properties)) {
      const propSchema = dbProperties[key];
      if (!propSchema) continue; // ignore invalid keys

      switch (propSchema.type) {
        case "title":
          formattedProperties[key] = {
            title: [{ text: { content: String(value) } }],
          };
          break;
        case "rich_text":
          formattedProperties[key] = {
            rich_text: [{ text: { content: String(value) } }],
          };
          break;
        case "select":
          formattedProperties[key] = {
            select: { name: String(value) },
          };
          break;
        case "status":
          formattedProperties[key] = {
            status: { name: String(value) },
          };
          break;
        case "date":
          formattedProperties[key] = {
            date: { start: String(value) },
          };
          break;
        case "number":
          formattedProperties[key] = { number: Number(value) };
          break;
        default:
          formattedProperties[key] = {
            rich_text: [{ text: { content: String(value) } }],
          };
      }
    }

    // ✅ Create page in Notion
    const response = await axios.post(
      "https://api.notion.com/v1/pages",
      {
        parent: { database_id },
        properties: formattedProperties,
      },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
      }
    );

    res.json({
      success: true,
      page_id: response.data.id,
      url: response.data.url,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});






// ✅ Get Database Properties Endpoint
app.post("/get-database-properties", async (req, res) => {
  try {
    const { database_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(401).json({ error: "Notion token missing in headers" });
    }
    if (!database_id) {
      return res.status(400).json({ error: "database_id is required" });
    }

    const response = await axios.get(
      `https://api.notion.com/v1/databases/${database_id}`,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION
        }
      }
    );

    const properties = response.data.properties;
    const allProperties = Object.keys(properties);

    const editableTypes = [
      "title",
      "rich_text",
      "number",
      "select",
      "multi_select",
      "status",
      "date",
      "checkbox",
      "url",
      "email",
      "phone_number",
      "people",
      "files"
    ];

    const editableProperties = Object.entries(properties)
      .filter(([name, prop]) => editableTypes.includes(prop.type))
      .map(([name]) => name);

    res.status(200).json({
      success: true,
      database_id,
      allProperties,
      editableProperties
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});




// ✅ Delete (Archive) a Page
app.post("/delete-page", async (req, res) => {
  try {
    const { page_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!page_id) {
      return res.status(400).json({ success: false, message: "page_id is required" });
    }

    const response = await axios.patch(
      `https://api.notion.com/v1/pages/${page_id}`,
      { archived: true },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `Page ${page_id} archived successfully`,
      page_id: response.data.id
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// ✅ Delete (Archive) a Database
app.post("/delete-database", async (req, res) => {
  try {
    const { database_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!database_id) {
      return res.status(400).json({ success: false, message: "database_id is required" });
    }

    const response = await axios.patch(
      `https://api.notion.com/v1/databases/${database_id}`,
      { archived: true },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `Database ${database_id} archived successfully`,
      database_id: response.data.id
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});



// ✅ Update Page Endpoint (Smart)
app.post("/update-page", async (req, res) => {
  try {
    const { page_id, properties } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!page_id || !properties) {
      return res.status(400).json({ success: false, message: "page_id and properties are required" });
    }

    const formattedProperties = {};

    // ✅ Smartly format properties based on key/type
    Object.entries(properties).forEach(([key, value]) => {
      if (typeof value === "string") {
        if (key.toLowerCase() === "status") {
          formattedProperties[key] = { status: { name: value } };
        } else if (key.toLowerCase().includes("date") || key.toLowerCase() === "deadline") {
          formattedProperties[key] = { date: { start: value } };
        } else {
          formattedProperties[key] = {
            title: [{ text: { content: value } }],
          };
        }
      } else {
        formattedProperties[key] = value; // If already formatted, use as-is
      }
    });

    const response = await axios.patch(
      `https://api.notion.com/v1/pages/${page_id}`,
      { properties: formattedProperties },
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
      }
    );

    res.status(200).json({
      success: true,
      page_id: response.data.id,
      url: response.data.url,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});




// ✅ Get Page Properties (All + Editable)
app.post("/get-page-properties", async (req, res) => {
  try {
    const { page_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(401).json({ success: false, message: "Notion token missing in headers" });
    }
    if (!page_id) {
      return res.status(400).json({ success: false, message: "page_id is required" });
    }

    const response = await axios.get(
      `https://api.notion.com/v1/pages/${page_id}`,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
        },
      }
    );

    const properties = response.data.properties;
    const allProperties = Object.keys(properties);

    const editableTypes = [
      "title",
      "rich_text",
      "number",
      "select",
      "multi_select",
      "status",
      "date",
      "checkbox",
      "url",
      "email",
      "phone_number",
      "people",
      "files",
    ];

    const editableProperties = Object.entries(properties)
      .filter(([_, prop]) => editableTypes.includes(prop.type))
      .map(([name]) => name);

    res.status(200).json({
      success: true,
      page_id,
      allProperties,
      editableProperties,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});


// ✅ Smart: Update page properties + append content (with deep logging)
app.post("/update-page1", async (req, res) => {
  console.log("\n===================== 📌 /update-page1 CALLED =====================");
  console.log("📝 Request Body:", JSON.stringify(req.body, null, 2));

  try {
    const { page_id, content, ...properties } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      console.error("❌ Missing notion-token in headers");
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!page_id) {
      console.error("❌ page_id is required");
      return res.status(400).json({ success: false, message: "page_id is required" });
    }

    // ✅ Fetch page properties to detect types
    console.log(`🔍 Fetching page details for page_id: ${page_id}`);
    const pageDetails = await axios.get(`https://api.notion.com/v1/pages/${page_id}`, {
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": "2022-06-28",
      },
    });

    const pageProps = pageDetails.data.properties;
    console.log("📄 Existing Page Properties Types:", 
      Object.keys(pageProps).map((k) => `${k}(${pageProps[k].type})`)
    );

    // ✅ Normalize property keys (case-insensitive match)
    const normalizedProps = {};
    for (const key of Object.keys(properties)) {
      const matchedKey = Object.keys(pageProps).find(
        (prop) => prop.toLowerCase() === key.toLowerCase()
      );
      if (matchedKey) normalizedProps[matchedKey] = properties[key];
      else console.warn(`⚠️ Property "${key}" does not exist in Notion page`);
    }

    // ✅ Format properties based on real types (FULL REPLACEMENT)
    const formattedProperties = {};
    for (const [key, value] of Object.entries(normalizedProps)) {
      const type = pageProps[key].type;
      console.log(`🔧 Updating property "${key}" (type: ${type}) with value: ${value}`);

      switch (type) {
        case "title":
          formattedProperties[key] = {
            title: value ? [{ text: { content: String(value) } }] : [],
          };
          break;
        case "rich_text":
          formattedProperties[key] = {
            rich_text: value ? [{ type: "text", text: { content: String(value) } }] : [],
          };
          break;
        case "multi_select":
          formattedProperties[key] = {
            multi_select: value
              ? (Array.isArray(value)
                  ? value.map((v) => ({ name: v }))
                  : [{ name: String(value) }])
              : [],
          };
          break;
        case "select":
          formattedProperties[key] = { select: value ? { name: String(value) } : null };
          break;
        case "status":
          formattedProperties[key] = { status: value ? { name: String(value) } : null };
          break;
        case "date":
          formattedProperties[key] = { date: value ? { start: value } : null };
          break;
        case "number":
          formattedProperties[key] = { number: value !== "" ? Number(value) : null };
          break;
        case "checkbox":
          formattedProperties[key] = { checkbox: Boolean(value) };
          break;
        case "url":
          formattedProperties[key] = { url: value ? String(value) : null };
          break;
        case "email":
          formattedProperties[key] = { email: value ? String(value) : null };
          break;
        case "phone_number":
          formattedProperties[key] = { phone_number: value ? String(value) : null };
          break;
        default:
          console.warn(`⚠️ Unsupported property type: ${key} (${type})`);
      }
    }

    // ✅ Update properties
    if (Object.keys(formattedProperties).length > 0) {
      console.log("✅ Sending PATCH request to update properties:", JSON.stringify(formattedProperties, null, 2));
      await axios.patch(
        `https://api.notion.com/v1/pages/${page_id}`,
        { properties: formattedProperties },
        {
          headers: {
            Authorization: `Bearer ${notionToken}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
        }
      );
    } else {
      console.log("⚠️ No valid properties to update.");
    }

    // ✅ Replace blocks (clear old + append new)
    let appendedBlocks = 0;
    if (content) {
      console.log("📝 Replacing Content Blocks:", content);

      // 🗑️ (Optional) CLEAR OLD BLOCKS
      const existingBlocks = await axios.get(
        `https://api.notion.com/v1/blocks/${page_id}/children?page_size=100`,
        { headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" } }
      );
      for (const block of existingBlocks.data.results) {
        await axios.delete(`https://api.notion.com/v1/blocks/${block.id}`, {
          headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" },
        });
      }

      // ➕ Append new blocks
      const blocks = Array.isArray(content)
        ? content.map((text) => ({
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
          }))
        : [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: String(content) } }] },
            },
          ];

      const blockResponse = await axios.patch(
        `https://api.notion.com/v1/blocks/${page_id}/children`,
        { children: blocks },
        {
          headers: {
            Authorization: `Bearer ${notionToken}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
        }
      );
      appendedBlocks = blockResponse.data.results.length;
      console.log(`✅ Replaced with ${appendedBlocks} new block(s).`);
    }

    console.log("🎉 Update completed successfully!");
    res.status(200).json({
      success: true,
      page_id,
      updatedProperties: Object.keys(formattedProperties),
      appendedBlocks,
    });
  } catch (error) {
    console.error("❌ ERROR OCCURRED:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});


// ✅ Fetch all pages (rows) from a database (Clean & Lightweight)
app.post("/get-database-rows", async (req, res) => {
  try {
    const { database_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!database_id) {
      return res.status(400).json({ success: false, message: "database_id is required" });
    }

    const response = await axios.post(
      `https://api.notion.com/v1/databases/${database_id}/query`,
      {},
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": "2022-06-28",
        },
      }
    );

    const rows = response.data.results.map((page) => {
      const cleanProps = {};

      Object.entries(page.properties).forEach(([key, prop]) => {
        switch (prop.type) {
          case "title":
            cleanProps[key] = prop.title?.[0]?.plain_text || "";
            break;
          case "rich_text":
            cleanProps[key] = prop.rich_text?.map((t) => t.plain_text).join(" ") || "";
            break;
          case "status":
            cleanProps[key] = prop.status?.name || "";
            break;
          case "select":
            cleanProps[key] = prop.select?.name || "";
            break;
          case "date":
            cleanProps[key] = prop.date?.start || "";
            break;
          case "multi_select":
            cleanProps[key] = prop.multi_select?.map((m) => m.name).join(", ") || "";
            break;
          default:
            cleanProps[key] = ""; // You can add more cases if needed
        }
      });

      return {
        page_id: page.id,
        url: page.url,
        properties: cleanProps,
      };
    });

    res.status(200).json({
      success: true,
      database_id,
      total: rows.length,
      rows,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data || error.message });
  }
});



// ✅ Retrieve a single page details
// ✅ Get Clean Page Details Endpoint
app.post("/get-page-details", async (req, res) => {
  try {
    const { page_id } = req.body;
    const notionToken = req.headers["notion-token"];

    if (!notionToken) {
      return res.status(400).json({ success: false, message: "Missing notion-token in headers" });
    }
    if (!page_id) {
      return res.status(400).json({ success: false, message: "page_id is required" });
    }

    const response = await axios.get(
      `https://api.notion.com/v1/pages/${page_id}`,
      {
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": "2022-06-28",
        },
      }
    );

    const notionProps = response.data.properties;
    const simplifiedProps = {};

    // ✅ Extract clean values
    Object.entries(notionProps).forEach(([key, value]) => {
      switch (value.type) {
        case "title":
          simplifiedProps[key] = value.title?.[0]?.plain_text || "";
          break;
        case "rich_text":
          simplifiedProps[key] = value.rich_text?.[0]?.plain_text || "";
          break;
        case "select":
          simplifiedProps[key] = value.select?.name || "";
          break;
        case "status":
          simplifiedProps[key] = value.status?.name || "";
          break;
        case "date":
          simplifiedProps[key] = value.date?.start || "";
          break;
        default:
          simplifiedProps[key] = "";
      }
    });

    res.status(200).json({
      success: true,
      page_id,
      url: response.data.url,
      properties: simplifiedProps,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
});



const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
