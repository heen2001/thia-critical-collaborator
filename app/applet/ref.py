import sys

def main():
    with open('src/App.tsx', 'r') as f:
        code = f.read()

    # 1. Update the layout flex container
    old_container = '<div className="flex-1 overflow-y-auto sm:p-4 gap-4 flex flex-col">'
    new_container = '<div className={`flex-1 sm:p-4 ${isMobile && isLandscape ? \'flex flex-row overflow-hidden\' : \'overflow-y-auto flex flex-col gap-4\'}`}>'
    code = code.replace(old_container, new_container)

    # 2. Update Video Container
    old_video = '                className="bg-black relative sm:rounded-lg overflow-hidden group cursor-move w-full aspect-video border-y sm:border border-gray-300"'
    new_video = '                className={`bg-black relative group cursor-move sm:rounded-lg overflow-hidden ${isMobile && isLandscape ? \'h-full flex-1 flex-shrink\' : \'w-full aspect-video border-y sm:border border-gray-300\'}`}'
    code = code.replace(old_video, new_video)

    # 3. Update Controls container
    old_controls = '<div className="flex flex-col gap-4 flex-1 mt-auto">'
    new_controls = '<div className={`flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'w-[300px] h-full overflow-y-auto overflow-x-hidden bg-gray-50 border-l border-gray-200\' : \'gap-4 flex-1 mt-auto\'}`}>'
    code = code.replace(old_controls, new_controls)

    # 4. Update Accordion styling
    old_accordion = '<div className="bg-white sm:border border-gray-100 sm:rounded-lg overflow-hidden flex flex-col flex-shrink-0 border-y sm:border-y-0 shadow-sm">'
    new_accordion = '<div className={`bg-white sm:border border-gray-100 sm:rounded-lg overflow-hidden flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'border-b border-gray-200\' : \'border-y sm:border-y-0 shadow-sm\'}`}>'
    code = code.replace(old_accordion, new_accordion)

    # 5. Update Action Buttons Container styling
    old_actions = '<div className="flex flex-col mt-auto flex-shrink-0 gap-6 p-4 border-t border-zinc-800">'
    new_actions = '<div className={`flex flex-col flex-shrink-0 ${isMobile && isLandscape ? \'gap-4 p-4 pb-6 mt-4\' : \'mt-auto gap-6 p-4 border-t border-zinc-800\'}`}>'
    code = code.replace(old_actions, new_actions)

    with open('src/App.tsx', 'w') as f:
        f.write(code)
    print("Success!")

if __name__ == '__main__':
    main()
