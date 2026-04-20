const fs = require('fs');

function main() {
    let code = fs.readFileSync('src/App.tsx', 'utf8');

    // 1. Update the layout flex container
    const old_container = '<div className="flex-1 overflow-y-auto sm:p-4 gap-4 flex flex-col">';
    const new_container = '<div className={`flex-1 sm:p-4 ${isMobile && isLandscape ? \'flex flex-row overflow-hidden\' : \'overflow-y-auto flex flex-col gap-4\'}`}>';
    code = code.replace(old_container, new_container);

    // 2. Update Video Container
    const old_video = '                className="bg-black relative sm:rounded-lg overflow-hidden group cursor-move w-full aspect-video border-y sm:border border-gray-300"';
    const new_video = '                className={`bg-black relative group cursor-move sm:rounded-lg overflow-hidden ${isMobile && isLandscape ? \'h-full flex-1 flex-shrink\' : \'w-full aspect-video border-y sm:border border-gray-300\'}`}';
    code = code.replace(old_video, new_video);

    // 3. Update Controls container
    const old_controls = '<div className="flex flex-col gap-4 flex-1 mt-auto">';
    const new_controls = '<div className={`flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'w-[300px] h-full overflow-y-auto overflow-x-hidden bg-white border-l border-gray-200\' : \'gap-4 flex-1 mt-auto\'}`}>';
    code = code.replace(old_controls, new_controls);

    // 4. Update Accordion styling
    const old_accordion = '<div className="bg-white sm:border border-gray-100 sm:rounded-lg overflow-hidden flex flex-col flex-shrink-0 border-y sm:border-y-0 shadow-sm">';
    const new_accordion = '<div className={`bg-white sm:border border-gray-100 sm:rounded-lg overflow-hidden flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'border-b border-gray-200\' : \'border-y sm:border-y-0 shadow-sm\'}`}>';
    code = code.replace(old_accordion, new_accordion);

    // 5. Update Action Buttons Container styling
    const old_actions = '<div className="flex flex-col mt-auto flex-shrink-0 gap-6 p-4 border-t border-zinc-800">';
    const new_actions = '<div className={`flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'gap-4 p-4 pb-6 mt-4\' : \'mt-auto gap-6 p-4 border-t border-zinc-800\'}`}>';
    code = code.replace(old_actions, new_actions);

    fs.writeFileSync('src/App.tsx', code);
    console.log("Success!");
}

main();
