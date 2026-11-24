module.exports = {
  products: [
    { id: 1, name: 'Crochet Bunny', stock: 2, price: 450 },
    { id: 2, name: 'Flower Bouquet', stock: 0, price: 600 },
    { id: 3, name: 'Mini Tote Bag', stock: 5, price: 800 },
    {
      id: 4, name: 'Crochet Damru Keychain (Big)', stock: 0, price: 250,
      category: 'Keychains', image_url: 'assets/keychain-damru-big.jpg',
      description: 'Handmade crochet damru keychain in the big size.'
    },
    {
      id: 5, name: 'Crochet Damru Keychain (Small)', stock: 0, price: 120,
      category: 'Keychains', image_url: 'assets/keychain-damru-small.jpg',
      description: 'Handmade crochet damru keychain in the small size.'
    },
    {
      id: 6, name: 'Blue Bird Crochet Keychain', stock: 0, price: 120,
      category: 'Keychains', image_url: 'assets/keychain-bluebird.jpg',
      description: 'Handmade blue crochet bird keychain.'
    }
  ],
  orders: []
};
