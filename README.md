# Storyteller App

A Vampire: The Dark Ages V20 Multiplayer RPG Platform.

## Features

- **Python FastAPI Backend**: Provides a robust RESTful API with support for WebSocket connections.
- **Vanilla JS/HTML/CSS Frontend**: Served statically, offering a responsive and engaging user interface.
- **Real-time Game Updates and Chat**: Utilizes WebSockets for real-time interactions between players.
- **RAG Knowledge Base Integration using ChromaDB**: Enhances the game with dynamic and context-aware information retrieval.
- **Graph Database Integration using Neo4j**: Manages complex relationships and data queries efficiently.
- **SQLite (aiosqlite) Main Database**: Offers a lightweight, yet powerful database solution for storing essential game data.
- **Playwright for E2E Testing**: Ensures the application's reliability through comprehensive end-to-end testing.

## Tech Stack

- **Backend**: Python FastAPI
- **Frontend**: Vanilla JS/HTML/CSS
- **WebSocket**: Real-time communication
- **Knowledge Base**: ChromaDB
- **Database**: SQLite (aiosqlite) and Neo4j (Graph Database)
- **Testing**: Playwright

## Getting Started

### Development Environment

To run the application in a development environment:

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd StorytellerApp
   ```

2. Execute the `run_dev.bat` script:
   ```bash
   run_dev.bat
   ```

   The application will start on port 8001 using isolated development databases.

### Production Environment

To deploy the application in a production environment:

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd StorytellerApp
   ```

2. Execute the `run_prod.bat` script:
   ```bash
   run_prod.bat
   ```

   The application will start on port 8000 and establish a Pinggy tunnel for external access.

## Contributions

We welcome contributions from developers of all skill levels. Please fork the repository, make your changes, and submit a pull request. For more information on contributing, please refer to our [Contribution Guidelines](CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

---

Thank you for choosing Storyteller App as your Vampire: The Dark Ages V20 Multiplayer RPG Platform!
