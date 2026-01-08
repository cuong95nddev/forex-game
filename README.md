# Forex Game - Multiplayer Gold Trading Game

A real-time multiplayer forex trading game built with React, TypeScript, Supabase, and Tailwind CSS. Players can trade gold (XAU/USD) with real-time price updates.

## ⚠️ IMPORTANT: Admin Panel Required

**The admin panel MUST be open for the game to work!**

- Admin panel acts as the central server broadcasting game state to all clients
- Navigate to `?admin=true` and keep that tab open
- If admin panel is closed, clients cannot play

### How to Use:
1. Open admin panel: `http://localhost:5173/?admin=true` (keep it open!)
2. Enable "Auto" mode for automatic game progression
3. Open client interface: `http://localhost:5173/` to play

## Features

- 🎮 **Real-time Trading**: Buy and sell gold with live price updates
- 👤 **Easy Access**: No account registration required - just enter your name
- 🔐 **User Identification**: Browser fingerprinting using FingerprintJS
- 💰 **Starting Balance**: Each player starts with $10,000
- 📊 **Live Market**: Real-time gold price updates using Supabase Realtime
- 👨‍💼 **Admin Panel**: Control gold prices and monitor all players
- 📱 **Responsive Design**: Beautiful UI built with Tailwind CSS
- 🎨 **Modern Icons**: Lucide React icons

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime
- **User ID**: FingerprintJS
- **Icons**: Lucide React
- **State Management**: Zustand

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- A Supabase account (free tier works fine)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Supabase:
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to your project settings and copy the URL and anon key
   - Run the SQL schema in the Supabase SQL editor (see `supabase-schema.sql`)

3. Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

4. Start the development server:
```bash
npm run dev
```

## Database Setup

Run the SQL in `supabase-schema.sql` file in your Supabase SQL Editor to create the required tables.

The schema includes:
- `users` - Player information and balances
- `gold_prices` - Historical gold prices
- `trades` - Trading history
- `positions` - Current player positions

## Usage

### Player Mode

1. Open the application in your browser
2. Enter your name (no registration needed)
3. Start trading gold with your $10,000 starting balance
4. View your positions and profit/loss in real-time

### Admin Mode

Access the admin panel by adding `?admin=true` to the URL:
```
http://localhost:5173/?admin=true
```

Admin features:
- Update gold price manually
- Random price updates
- Auto-update with configurable intervals
- View all players and their positions
- Monitor total market statistics

## Project Structure

```
src/
├── components/
│   ├── NameInput.tsx          # User name input screen
│   ├── TradingInterface.tsx   # Main trading UI
│   └── AdminPanel.tsx         # Admin control panel
├── lib/
│   ├── supabase.ts           # Supabase client and types
│   └── fingerprint.ts        # Browser fingerprinting
├── store/
│   └── useStore.ts           # Zustand state management
├── App.tsx                   # Main app component
└── index.css                 # Tailwind styles
```

## Environment Variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## How It Works

1. **User Identification**: Uses FingerprintJS to generate a unique browser ID
2. **First Visit**: User enters their name and receives $10,000 starting balance
3. **Trading**: Users can buy/sell gold at current market price
4. **Real-time Updates**: Supabase Realtime pushes price updates to all connected clients
5. **Admin Control**: Admin can update prices manually, randomly, or automatically
6. **Position Tracking**: System tracks each user's gold holdings and calculates P&L

## Security Notes

- This is a demo application for educational purposes
- Row Level Security (RLS) is enabled but policies are permissive
- In production, implement proper authentication and authorization
- Consider adding rate limiting for trades
- Add validation for trade amounts and user balances

## Future Enhancements

- [ ] Add more trading pairs (EUR/USD, BTC/USD, etc.)
- [ ] Trading history and charts
- [ ] Leaderboard system
- [ ] Stop-loss and take-profit orders
- [ ] Mobile app version
- [ ] Social features (chat, friend list)
- [ ] Achievement system
- [ ] Advanced charting with technical indicators

## License

MIT

---

Built with ❤️ using React, Supabase, and Tailwind CSS

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
