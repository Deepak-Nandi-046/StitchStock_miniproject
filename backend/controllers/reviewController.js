const db = require('../db');
const store = require('../db/reviewStore');

exports.list = async (req, res) => {
  res.json(await store.list(req.params.productId));
};

exports.create = async (req, res) => {
  const productId = Number(req.params.productId);
  const product = db.products.find(item => Number(item.id) === productId);
  const { rating, text = '', photo = '' } = req.body || {};
  const reviewText = typeof text === 'string' ? text.trim() : '';
  if (!product || !Number.isInteger(rating) || rating < 1 || rating > 5)
    return res.status(400).json({ error: 'Choose a product and a rating from 1 to 5.' });
  if (reviewText.length > 1200)
    return res.status(400).json({ error: 'Reviews must be 1,200 characters or fewer.' });

  let savedPhoto = '';
  if (photo) {
    const match = typeof photo === 'string'
      ? photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match) return res.status(400).json({ error: 'Review photos must be JPG, PNG, or WebP.' });
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 2 * 1024 * 1024)
      return res.status(400).json({ error: 'Review photos must be 2 MB or smaller.' });
    savedPhoto = `data:${match[1]};base64,${image.toString('base64')}`;
  }

  const review = await store.create({
    productId,
    customerId: req.user.id,
    customerName: req.user.name,
    rating,
    text: reviewText,
    photo: savedPhoto,
  });
  res.status(201).json(review);
};
