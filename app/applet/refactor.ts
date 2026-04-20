import fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

// The marker before the return statement
const returnMarker = '  return (\n    <div className="flex flex-col h-screen w-full overflow-hidden">';
const returnIndex = code.indexOf(returnMarker);

// Vision Feed block
const visionStartString = '<div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50 flex items-center justify-between">';
const visionStart = code.indexOf(visionStartString);
// The end of Vision Feed is before the Panel close tag
const visionEndString = '                </div>\n              </div>\n            </div>\n          </Panel>';
const visionEnd = code.indexOf(visionEndString) + '                </div>\n              </div>\n            </div>'.length;

const visionJSX = code.substring(visionStart, visionEnd);

// Chat & Context Tab Block
const chatStartString = '            {/* Tabs Header */}';
const chatStart = code.indexOf(chatStartString);
const chatEndString = '                  </motion.div>\n                )}\n              </AnimatePresence>\n            </div>\n          </Panel>';
const chatEnd = code.indexOf(chatEndString) + '                  </motion.div>\n                )}\n              </AnimatePresence>\n            </div>'.length;

const chatJSX = code.substring(chatStart, chatEnd);

// Now compose the new layout
const newLayout = `
  const renderVisionFeed = () => (
    <>
      ${visionJSX.trim()}
    </>
  );

  const renderContextArea = () => (
    <>
      ${chatJSX.trim()}
    </>
  );

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-gray-200 bg-white z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <Brain size={18} className="text-white" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-gray-900">Thia</h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          <AnimatePresence>
            {isLiveActive && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-md shadow-sm"
              >
                <div className={\`w-1.5 h-1.5 rounded-full bg-blue-500 \${isThiaSpeaking ? 'animate-pulse' : 'opacity-40'}\`} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                  {isThiaSpeaking ? 'Assistant Speaking' : 'Listening...'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className={\`px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider border flex items-center gap-1.5 \${isLiveActive ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-gray-200 text-gray-500'}\`}>
            <div className={\`w-1 h-1 rounded-full \${isLiveActive ? 'bg-blue-600' : 'bg-gray-400'}\`} />
            {isLiveActive ? 'Connected' : 'Offline'}
          </div>
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-900"
            title="Open in new tab"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-0 sm:p-4 bg-gray-50 relative">
        {isMobile ? (
          <div className="h-full w-full flex flex-col relative bg-white">
            {renderVisionFeed()}

            {/* Mobile Drawer Trigger */}
            <button 
              onClick={() => setIsMobileDrawerOpen(true)}
              className="absolute bottom-6 right-6 h-14 w-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-transform active:scale-95"
            >
              <MessageSquare size={24} />
            </button>

            {/* Mobile Drawer Overlay */}
            <AnimatePresence>
              {isMobileDrawerOpen && (
                <motion.div 
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-0 z-40 bg-white flex flex-col"
                >
                  <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <span className="font-semibold text-sm">Session Data</span>
                    <button onClick={() => setIsMobileDrawerOpen(false)} className="p-2 -mr-2 text-gray-500">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col relative bg-white">
                    {renderContextArea()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Group direction="horizontal" className="h-full w-full sm:rounded-lg border-y sm:border border-gray-200 overflow-hidden bg-white">
            <Panel defaultSize={75} minSize={25} className="flex flex-col border-r sm:border-r-0 border-gray-200 sm:rounded-l-lg bg-white relative h-full">
              {renderVisionFeed()}
            </Panel>
            
            <Separator className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors cursor-col-resize" />
            
            <Panel defaultSize={25} minSize={20} className="flex flex-col border-l sm:border-l-0 border-gray-200 sm:rounded-r-lg bg-white overflow-hidden relative h-full">
              {renderContextArea()}
            </Panel>
          </Group>
        )}
      </main>
    </div>
  );
}
`;

// Replace the end part of the code
const newCode = code.substring(0, returnIndex) + newLayout;
fs.writeFileSync('src/App.tsx', newCode);
console.log("Refactoring complete");
