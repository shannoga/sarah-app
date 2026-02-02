import ChatInterface from './components/ChatInterface';

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">Sarah</h1>
          <p className="text-gray-600">Chat with Claude</p>
        </div>
      </header>
      <main className="max-w-4xl mx-auto py-6 px-4">
        <ChatInterface />
      </main>
    </div>
  );
}

export default App;
