import { motion } from "motion/react";
import { Button } from "./components/ui/button";
import { LoginPage } from "./components/LoginPage";
import { MainPage } from "./components/MainPage";
import { useState } from "react";

export default function App() {
  const [currentPage, setCurrentPage] = useState<
    "welcome" | "learnmore" | "login" | "main"
  >("welcome");

  const handleContinue = () => {
    setCurrentPage("login");
  };

  const handleLearnMore = () => {
    setCurrentPage("learnmore");
  };

  const handleLoginSuccess = () => {
    setCurrentPage("main");
  };

  const handleLogout = () => {
    setCurrentPage("login");
  };

  if (currentPage === "main") {
    return <MainPage onLogout={handleLogout} />;
  }

  if (currentPage === "login") {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  if (currentPage === "learnmore") {
    return (
      <div className="size-full flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 overflow-hidden relative">
        {/* Grid Pattern Background */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Animated Geometric Shapes */}
        <motion.div
          className="absolute top-20 left-20 w-32 h-32 bg-red-900 rounded-full blur-3xl opacity-20"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-40 h-40 bg-gray-700 rounded-full blur-3xl opacity-20"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />
        
        {/* Diagonal Red Accent Line */}
        <motion.div
          className="absolute top-0 right-0 w-1 h-96 bg-gradient-to-b from-red-600 to-transparent rotate-45 origin-top-right"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
        />
        
        {/* Bottom Left Accent */}
        <motion.div
          className="absolute bottom-0 left-0 w-96 h-1 bg-gradient-to-r from-red-600 to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.4 }}
        />

        {/* Floating Squares */}
        <motion.div
          className="absolute top-1/4 right-1/4 w-16 h-16 border-2 border-gray-700 rotate-45"
          animate={{
            y: [0, -20, 0],
            rotate: [45, 50, 45],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/3 left-1/4 w-12 h-12 border border-red-900 rotate-12"
          animate={{
            y: [0, 15, 0],
            rotate: [12, 20, 12],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />

        {/* Corner Decorative Elements */}
        <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-gray-800" />
        <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-gray-800" />
        
        {/* Red Corner Accents */}
        <motion.div
          className="absolute top-0 left-0 w-2 h-16 bg-red-600"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
        <motion.div
          className="absolute top-0 left-0 w-16 h-2 bg-red-600"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />

        {/* Content Card */}
        <motion.div
          className="max-w-4xl mx-auto px-8 py-12 text-center relative z-10 bg-gray-900/30 backdrop-blur-sm rounded-3xl border border-gray-600/40"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Small header text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-sm text-gray-400 mb-4"
          >
            Learn More About
          </motion.p>

          {/* Large heading */}
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="text-5xl mb-6 text-white"
          >
            AI for Arbitration
          </motion.h1>

          {/* Lorem Ipsum Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="text-gray-400 mb-8 leading-relaxed max-w-2xl mx-auto"
          >
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          </motion.p>

          {/* Continue Button */}
          <motion.div
            className="flex gap-4 justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          >
            <Button
              onClick={handleContinue}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 transition-all duration-300 text-white rounded-lg"
            >
              Continue
            </Button>
          </motion.div>
        </motion.div>

        {/* Orbiting Particles */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-2 h-2 bg-red-500 rounded-full"
          animate={{
            x: [0, 100, 0, -100, 0],
            y: [0, -100, 0, 100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-gray-400 rounded-full"
          animate={{
            x: [0, -80, 0, 80, 0],
            y: [0, 80, 0, -80, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>
    );
  }

  return (
    <div className="size-full flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 overflow-hidden relative">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Animated Geometric Shapes */}
      <motion.div
        className="absolute top-20 left-20 w-32 h-32 bg-red-900 rounded-full blur-3xl opacity-20"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-20 right-20 w-40 h-40 bg-gray-700 rounded-full blur-3xl opacity-20"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
      />
      
      {/* Diagonal Red Accent Line */}
      <motion.div
        className="absolute top-0 right-0 w-1 h-96 bg-gradient-to-b from-red-600 to-transparent rotate-45 origin-top-right"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 1.2, delay: 0.2 }}
      />
      
      {/* Bottom Left Accent */}
      <motion.div
        className="absolute bottom-0 left-0 w-96 h-1 bg-gradient-to-r from-red-600 to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, delay: 0.4 }}
      />

      {/* Floating Squares */}
      <motion.div
        className="absolute top-1/4 right-1/4 w-16 h-16 border-2 border-gray-700 rotate-45"
        animate={{
          y: [0, -20, 0],
          rotate: [45, 50, 45],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-1/3 left-1/4 w-12 h-12 border border-red-900 rotate-12"
        animate={{
          y: [0, 15, 0],
          rotate: [12, 20, 12],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      {/* Corner Decorative Elements */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-gray-800" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-gray-800" />
      
      {/* Red Corner Accents */}
      <motion.div
        className="absolute top-0 left-0 w-2 h-16 bg-red-600"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.div
        className="absolute top-0 left-0 w-16 h-2 bg-red-600"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />

      {/* Content Card */}
      <motion.div
        className="max-w-4xl mx-auto px-8 py-12 text-center relative z-10 bg-gray-900/30 backdrop-blur-sm rounded-3xl border border-gray-600/40"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {/* Small header text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-sm text-gray-400 mb-4"
        >
          Welcome to Your Journey
        </motion.p>

        {/* Large heading */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="text-5xl mb-6 text-white"
        >
          AI for Arbitration
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="text-gray-400 mb-8 leading-relaxed max-w-2xl mx-auto"
        >
          Discover a new way to experience arbitration workflows. We've crafted something special for you, combining elegant design with powerful functionality. Get ready to explore possibilities you never imagined.
        </motion.p>

        {/* Buttons */}
        <motion.div
          className="flex gap-4 justify-center mb-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
        >
          <Button
            onClick={handleContinue}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 transition-all duration-300 text-white rounded-lg"
          >
            Continue
          </Button>
          <Button
            onClick={handleLearnMore}
            variant="outline"
            className="px-8 py-3 bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700/50 transition-all duration-300 rounded-lg"
          >
            Learn more
          </Button>
        </motion.div>

        {/* Tip text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="text-sm text-gray-500"
        >
          Tip: If you already have a session, you'll go straight to the dashboard.
        </motion.p>
      </motion.div>

      {/* Orbiting Particles */}
      <motion.div
        className="absolute top-1/2 left-1/2 w-2 h-2 bg-red-500 rounded-full"
        animate={{
          x: [0, 100, 0, -100, 0],
          y: [0, -100, 0, 100, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-gray-400 rounded-full"
        animate={{
          x: [0, -80, 0, 80, 0],
          y: [0, 80, 0, -80, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}