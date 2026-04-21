import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Analyze from './pages/Analyze';
import Reports from './pages/Reports';
import Report from './pages/Report';
import SignIn from './pages/SignIn';
import Benchmark from './pages/Benchmark';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<Report />} />
          <Route path="/report/:id" element={<Report />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/benchmark" element={<Benchmark />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
