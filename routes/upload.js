const express = require('express');
const router = express.Router();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const region = process.env.AWS_REGION || 'ap-southeast-1';
const bucket = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region });

router.post('/presign', async (req, res, next) => {
  try {
    if (!bucket) return res.status(400).json({ error: 'Missing S3_BUCKET_NAME' });
    const { fileName, fileType } = req.body || {};
    if (!fileName || !fileType) return res.status(400).json({ error: 'fileName & fileType required' });
    const Key = `xray/${Date.now()}-${fileName}`;
    const command = new PutObjectCommand({ Bucket: bucket, Key, ContentType: fileType });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({ url, method: 'PUT', key: Key });
  } catch (e) { next(e); }
});

module.exports = router;
