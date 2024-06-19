import { wrapDocument } from '@govtechsg/open-attestation';
import { encryptString, decryptString } from '@govtechsg/oa-encryption';
import Ajv from 'ajv';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import gracefulShutdown from 'http-graceful-shutdown';

const CONFIG_FILE = "server-config.json";

if (!fsSync.existsSync(CONFIG_FILE)) {
  console.error("server-config.json not found");
  process.exit(1);
}

const cfg = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
const app = express();

app.use(helmet());
app.use(express.json({ limit: Number.Infinity }))
app.use(express.urlencoded({ extended: false, limit: Number.Infinity }));
app.disable("x-powered-by");

app.post("/api/decrypt-document", async (req, res, next) => {
  try {
    const { document_key, encrypted_document } = req.body;
    const rawString = decryptString({ ...encrypted_document, key: document_key });
    const data = JSON.parse(rawString);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

app.post("/api/encrypt-document", async (req, res, next) => {
  try {
    const body = req.body;
    const documentKey = body.document_key;

    if (!('data' in body) || typeof body.data !== 'object') {
      res.status(400).json({ message: "INVALID_DATA" })
      return;
    }

    if (documentKey != null && typeof documentKey !== 'string') {
      res.status(400).json({ message: "INVALID_DOCUMENT_KEY" })
      return
    }

    const ajv = new Ajv();
    const validate = ajv.compile(cfg.schema);
    const valid = validate(body.data);

    if (!valid) {
      res.status(400).json({
        message: "INVALID_DATA",
        errors: validate.errors,
      });
      return;
    }

    const documentData = {
      ...body.data,
      ...cfg.template,
    };

    const wrappedDocument = wrapDocument(documentData);
    const signature = wrappedDocument.signature;
    const documentId = body.data.id;
    const rawString = JSON.stringify(wrappedDocument);
    const { key, ...parts } = encryptString(rawString, documentKey);

    res.json({
      document_id: documentId,
      document_signature: signature,
      document_key: key,
      encrypted_document: parts,
    });

  } catch (e) {
    next(e);
  }
});

const port = Number.parseInt(process.env.PORT) || 80;
app.listen(port, () => console.log(`http://0.0.0.0:${port}`));
gracefulShutdown(app);
