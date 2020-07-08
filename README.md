# olympus
Rapid expression of intent.

_AST manipulation of Vue components._
![methods](https://user-images.githubusercontent.com/12804458/86932553-23eab800-c0ff-11ea-9dab-748c5a780084.gif)

_Immediate interaction with TailwindCSS._
![style](https://user-images.githubusercontent.com/12804458/86932574-29e09900-c0ff-11ea-84bd-f52d22d03fb4.gif)

## Purpose
This prototype extension automates a set of simple interactions with Vue components and Tailwind classes via semantic keyboard shortcuts.

You can add, rename, update, and remove most component attributes.

Tailwind classes are made more accessible through a selection of shortcuts, a navigation mechanic, and instant visual feedback via socket.io.


## Features

![list](https://user-images.githubusercontent.com/12804458/86932558-26e5a880-c0ff-11ea-9bf4-ff8387fe0298.gif)

The main thrust of the extension is a keyboard-driven menu that you open by the default shortcut `alt+o`. Once open, it's pretty self-explanatory. Most actions auto-populate their first argument from the current word under the cursor.

Since this extension is built around hacks of the QuickPick interface, the input doesn't always behave in a nice fashion. When working with multiple selections, you have to press `esc` to confirm your choices.

### Attribute addition, renaming, updating, and removing
In terms of Vue components, you have actions for interacting with:

    + components
    + props
    + data
    + computed
    + watchers
    + methods

Components are imported and deported. Every other attribute has at least an `add`, `rename`, and `remove` action. Props, computed, and watchers also have actions for updating their configurations. No more converting from prop array syntax to object syntax by hand. Making a watcher `deep` is as simple as `alt+o uwd [esc]` (assuming the name of a watcher is under your cursor--but you'll be prompted with a QuickPick list if it isn't).

![props](https://user-images.githubusercontent.com/12804458/86932548-2220f480-c0ff-11ea-86d8-4aa4b26a3a32.gif)


### Tailwind class editing
Type `alt+o et` to select the closest tag __BEFORE__ your cursor.

Now type a class name or shortcut, then press `spacebar` to toggle it. Tailwind classes are grouped into families based on the properties they modify. If `flex` is on the element and I add `inline`, `flex` will be removed. You don't have to remove old classes. Just add the classes you want and the extension will manage the families for you.

The editing interface is built as a QuickPick. Each item includes the name of the class, its shortcut (if it has one), and the properties that it modifies. You can search by any one of these.

### Class Navigation
Once you've typed a class, instead of pressing `spacebar`, you can type `j` or `k` to select another class in the family. For example, type `alt+o et my-1` and then hold `j`. You'll rapidly cycle through the available `my-{x}` classes.

### Component Extraction
`alt+o ex`: It's perhaps too simple for now, but it selects the tag before your cursor, prompts you for a component name, then replaces the class list with the component class and copies the generated component class rules to your clipboard.

### Immediate Feedback
The class-entry mechanic cuts a little time off the action cycle, but we still have to save the file and wait for the live page to re-build before we can see what we've done. Or do we? To further short circuit the feedback loop, there's a simple socket.io mechanic for patching classes on a live webpage in tandem with the source editing.

![style-setup](https://user-images.githubusercontent.com/12804458/86932565-28af6c00-c0ff-11ea-8c7a-14f9221e573f.gif)

#### Step 1: Copy the socket snippet into your application: `alt+o ss`
This socket snippet imports socket.io if it's not on the page, then listens on port 4242 for the 'edit-classes' event. I usually drop the snippet in my `main.js` file.

#### Step 2:  Add olympus ids to your component: `alt+o ai`
The easiest way to match source code to a live representation is to give each element a unique id through the `data-olympus` attribute.

#### Step 3: Edit CSS at the speed of thought
We can now rapidly access and cycle through classes, and see them applied *in real time*. No more saving the file and waiting for the build cycle to run every time you want to tinker with a class. No more tinkering with your styles through the devtools and copying your changes back to the code. Changes to the code and changes to the browser happen in sync.

#### Step 4: When you're done, remove olympus ids: `alt+o ri`
The `data-olympus` attribute doesn't do any harm, but there's no real need for it to make it into your project history. Be sure to remove it before you commit.


## Requirements

None.

## Extension Settings

None yet.

## Known Issues

This is a prototype extension. I'm looking for feedback to make it better. Please open issues or send me an email (cameronking42@gmail.com) letting me know of any bugs, what you like, or what you dislike.

## Release Notes

### 0.1.0

Initial release