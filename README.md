# Competitive Programming Profile Cards API 🏆

Generate beautiful SVG profile cards, rating graphs, and activity heatmaps for competitive programming platforms. Currently supports Codeforces and CodeChef.

![Codeforces Profile Card Demo](https://your-domain.com/card/cf/tourist/profile)

## Features ✨

- **Dynamic SVG Generation**: Real-time SVG cards generated from the latest user data
- **Multiple Card Types**: Profile cards, rating graphs, and activity heatmaps
- **Platform Support**: 
  - Codeforces (Profile, Rating Graph, Heatmap)
  - CodeChef (Profile, Rating Graph, Heatmap)
- **Auto-updating**: Cards automatically update with fresh data every 5 minutes
- **Responsive Design**: Cards look great at any size and on any device
- **Beautiful Design**: Modern, clean design matching platform color schemes
- **Error Handling**: Graceful fallbacks and informative error messages

## API Endpoints 🛠️

### Codeforces Cards

1. Profile Card:
```
GET /card/cf/{handle}/profile
```

2. Rating Graph:
```
GET /card/cf/{handle}/graph
```

3. Activity Heatmap:
```
GET /card/cf/{handle}/heatmap
```

### CodeChef Cards

1. Profile Card:
```
GET /card/cc/{handle}/profile
```

2. Rating Graph:
```
GET /card/cc/{handle}/graph
```

3. Activity Heatmap:
```
GET /card/cc/{handle}/heatmap
```

## Usage 📝

### In GitHub README

```markdown
![Codeforces Profile](https://your-domain.com/card/cf/your-handle/profile)
![Codeforces Graph](https://your-domain.com/card/cf/your-handle/graph)
![Codeforces Heatmap](https://your-domain.com/card/cf/your-handle/heatmap)
```

### In HTML

```html
<img src="https://your-domain.com/card/cf/your-handle/profile" alt="Codeforces Profile">
<img src="https://your-domain.com/card/cf/your-handle/graph" alt="Codeforces Graph">
<img src="https://your-domain.com/card/cf/your-handle/heatmap" alt="Codeforces Heatmap">
```

## Setup 🚀

1. Clone the repository:
```bash
git clone https://github.com/yourusername/Codeforces-Profile-Card.git
cd Codeforces-Profile-Card
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your Codeforces API credentials:
```env
API_KEY=your_codeforces_api_key
API_SECRET=your_codeforces_api_secret
PORT=3000
```

4. Start the server:
```bash
npm start
```

The server will start at `http://localhost:3000`

## Environment Variables 🔑

- `API_KEY`: Your Codeforces API key
- `API_SECRET`: Your Codeforces API secret
- `PORT`: Server port (default: 3000)

## Rate Limits 🚦

To ensure service stability:
- Maximum 100 requests per minute per IP
- Cards are cached for 5 minutes to reduce API load

## Development 👨‍💻

1. Install development dependencies:
```bash
npm install --save-dev nodemon
```

2. Start development server with auto-reload:
```bash
npm run dev
```

## Contributing 🤝

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License 📄

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments 🙏

- [Codeforces](https://codeforces.com/) for their API
- [CodeChef](https://www.codechef.com/) for their platform data
- All competitive programmers who inspired this project

## Support 💬

For support, feature requests, or bug reports, please open an issue in the GitHub repository.

---

Made with ❤️ for the competitive programming community 