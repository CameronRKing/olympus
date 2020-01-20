# olympus
Rapid expression of intent.

## Purpose
This prototype extension automates a set of simple interactions with Vue components and Tailwind classes via semantic keyboard shortcuts.

You can add, rename, update, and remove most component attributes.

Tailwind classes are made more accessible through a selection of shortcuts, a navigation mechanic, and instant visual feedback via socket.io.


## Features
The main thrust of the extension is a keyboard-driven menu that you open by the default shortcut `alt+o`. Once open, it's pretty self-explanatory. You can find the list of available actions in `src/actions.js`. Most actions auto-populate their first argument from the current word under the cursor.

### Attribute addition, renaming, updating, and removing
In terms of Vue components, you have actions for interacting with:

    + components
    + props
    + data
    + computed
    + watchers
    + methods

Components are imported and deported. Every other attribute has at least an `add`, `rename`, and `remove` action. Props, computed, and watchers also have actions for updating their configurations. No more converting from prop array syntax to object syntax by hand. Making a watcher `deep` is as simple as `alt+o uwd [esc]` (assuming the name of a watcher is under your cursor--but you'll be prompted with a QuickPick list if it isn't).


### Tailwind class editing
Type `alt+o et` to select the closest tag __BEFORE__ your cursor.

Now type a class name or shortcut, then press `spacebar` to toggle it. Tailwind classes are grouped into families based on the properties they modify. If `flex` is on the element and I add `inline`, `flex` will be removed. You don't have to remove old classes. Just add the classes you want and the extension will manage the families for you.

The editing interface is built as a QuickPick. Each item includes the name of the class, its shortcut (if it has one), and the properties that it modifies. You can search by any one of these.

### Class Navigation
Once you've typed a class, instead of pressing `spacebar`, you can type `j` or `k` to select another class in the family. For example, type `alt+o et my-1` and then hold `j`. You'll rapidly cycle through the available `my-{x}` classes.

### Component Extraction
`alt+o ex`: It's perhaps too simple for now, but it selects the tag before your cursor, prompts your for a component name, then replaces the class list with the component class and copies the generated component classes to your clipboard.

### Immediate Feedback
The class-entry mechanic cuts a little time off the action cycle, but we still have to save the file and wait for the live page to re-build before we can see what we've done. Or do we? To further short circuit the feedback loop, there's a simple socket.io mechanic for patching classes on a live webpage in tandem with the source editing.

#### Step 1: Add olympus ids to your component: `alt+o ai`
The easiest way to match source code to a live representation is to give each element a unique id through the `data-olympus` attribute.

#### Step 2: Copy the socket snippet into your application: `alt+o ss`
This socket snippet listens on port 4242 for the 'edit-classes' event. You'll need to have socket.io already on the page (for now). I usually drop the snippet in my `main.js` file.

#### Step 3: Edit CSS at the speed of thought
We can now rapidly access and cycle through classes, and see them applied *in real time*. No more saving the file and waiting for the build cycle to run every time you want to tinker with a class. No more tinkering with your styles through the devtools and copying your changes back to the code.

#### Step 4: When you're done, remove olympus ids: `alt+o ri`
The `data-olympus` attribute doesn't do any harm, but there's no real need for it to make it into your project history. Be sure to remove it before you commit.


## Requirements

Socket.io in your application, if you want to use the live class-editing feature.

## Extension Settings

None yet.

## Known Issues

None yet, though I believe that there are bugs in the logic that will take more detailed test cases to work out.

## Release Notes

### 0.0.1

Initial release