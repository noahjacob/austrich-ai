import { NavLink, useLocation } from 'react-router-dom';
import { UserCircle } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  const isReportsActive = location.pathname.startsWith('/reports');

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - App name */}
          <NavLink
            to="/"
            className="text-2xl font-bold text-gray-900 hover:text-primary-600 transition-colors"
          >
            AuSTRICH-AI
          </NavLink>

          {/* Center/Right - Navigation links */}
          <div className="flex items-center space-x-8">
            <NavLink
              to="/analyze"
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-600 hover:text-gray-900'
                }`
              }
            >
              Analyze
            </NavLink>
            
            <NavLink
              to="/reports"
              className={`text-sm font-medium transition-colors ${
                isReportsActive
                  ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Reports
            </NavLink>

            {/* User icon */}
            <NavLink
              to="/signin"
              className="text-gray-600 hover:text-primary-600 transition-colors relative group"
              title="Sign in"
            >
              <UserCircle className="h-6 w-6" />
              <span className="sr-only">Sign in</span>
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}

