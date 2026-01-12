import AuthGate from "./components/AuthGate";
import DocsApp from "./components/DocsApp";

export default function App() {
  return (
    <AuthGate>
      <DocsApp />
    </AuthGate>
  );
}
