const { expect } = require('chai');
const VueParser = require('../../src/VueParser.js');
describe('Vue Parser', () => {
    describe.only('accepts a string and returns a collection of named ASTs', () => {
        let asts;
        const inlineCmp = () => new VueParser(`<script>
export default {}
</script>`);
        const getCmp = async () => {
            const parser = inlineCmp();
            await parser.ready();
            return parser;
        };
        beforeEach(async () => {
            asts = await getCmp();
        });

        it('...that imports new components', () => {
            asts.importComponent('src/components/FooCmp.vue');
            expect(asts.toString()).to.equal(`<script>
import FooCmp from '@/components/FooCmp.vue';
export default {
    components: {
        FooCmp
    }
};
</script>`);
        });

        it('   and deports old ones', () => {
            asts.importComponent('src/components/FooCmp.vue');
            asts.deportComponent('FooCmp');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`)
        });

        it('...that adds new props', () => {
            asts.addProp('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    props: ['foo']
};
</script>`);
        });

        it('   and removes them', () => {
            asts.addProp('foo');
            asts.removeProp('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        })

        it('   and updates their required, default, type, and validator attributes', () => {
            asts.addProp('foo');
            asts.updateProp('foo', {
                required: 'true',
                default: `'irrelevant'`,
                type: 'String',
                validator: `(val) => val == 'secret-key'`
            });
            expect(asts.toString()).to.equal(`<script>
export default {
    props: {
        foo: {
            required: true,
            default: 'irrelevant',
            type: String,
            validator: (val) => val == 'secret-key'
        }
    }
};
</script>`);
            // set the attribute to null to remove it
            asts.updateProp('foo', {
                required: null,
                default: null,
                type: null,
                validator: null
            });

            expect(asts.toString()).to.equal(`<script>
export default {
    props: ['foo']
};
</script>`);
        });

        // todo
        it.skip('    and renames it everywhere', () => {
            asts.addProp('foo');
            asts.renameProp('foo', 'bar');
            // in the props declarations
            expect(asts.toString()).to.match(`<script>
export default {
    props: ['bar']
};
</script>`)
            // in the template
            // in the rest of the script
            // in components that bind to it directly
            // in tests that touch it
        });

        it('...that adds new data', () => {
            asts.addData('foo', `'bar'`);
            expect(asts.toString()).to.equal(`<script>
export default {
    data() {
        return {
            foo: 'bar'
        };
    }
};
</script>`);
        });

        it('   and sets it to new values', () => {
            asts.addData('bar', `'initial-value'`);
            asts.setData('bar', `'new-value'`);
            expect(asts.toString()).to.equal(`<script>
export default {
    data() {
        return {
            bar: 'new-value'
        };
    }
};
</script>`)
        });

        it('   and removes it', () => {
            asts.addData('bar', `'value'`);
            asts.removeData('bar');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });

        it('...that adds watchers', () => {
            asts.addWatcher('foo');
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo(newVal, oldVal) {}
    }
};
</script>`)
        });

        it('    and configures their deep/immediate attributes', () => {
            asts.addWatcher('foo');
            asts.updateWatcher('foo', { deep: true, immediate: true });
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo: {
            handler(newVal, oldVal) {},
            deep: true,
            immediate: true
        }
    }
};
</script>`);

            asts.updateWatcher('foo', { deep: null, immediate: null });
            expect(asts.toString()).to.equal(`<script>
export default {
    watch: {
        foo(newVal, oldVal) {}
    }
};
</script>`);
        });

        it('   and removes watchers', () => {
            asts.addWatcher('foo');
            asts.removeWatcher('foo');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);

            asts.addWatcher('bar');
            asts.updateWatcher('bar', { deep: true, immediate: true });
            asts.removeWatcher('bar');
            expect(asts.toString()).to.equal(`<script>
export default {}
</script>`);
        });

        it('....that adds, renames, and deletes computed properties', () => {

        });

        it('...and all that stuff for methods, too', () => {

        });

        it('but most importantly, it can refactor itself to produce two new components', () => {
            // show a real-life example, detailing how it extricates logic
        });

        // MOVE TO DIFFERENT MODULE THAT VUE PARSER HAPPENS TO USE
        it(' (it also gives you a jQuery-like API for manipulating the DOM in the template', () => {

        });

        // MOVE TO DIFFERENT MODULE THAT VUE PARSER HAPPENS TO USE
        it('  (as well as a similar DSL for dealing with the JS abstract syntax tree)', () => {

        });

        // MOVE TO A DIFFERENT MODULE THAT VUE PARSER HAPPENS TO USE
        it('  (and yet another for postcss)', () => {

        });
    });
});

// router parser
    // bootstrap
    // add route
    // rename route
    // change component
    // manipulate all those properties of routes that I never use

// store parser
    // bootstrap
    // add item
    // add mutator
    // add action
    // rename/delete/move to module for all of these

// store/component integration:
    // see uses of store
    // offer "add to store" from within component
    // push data from component internals to store
    // inline data from store to component internals 

// route/component integration:
    // see what routes this compoent is used in/directly attached to
    // add to new route
    // edit route(s) of current component
    

// tailwind class editor
// tailwind style pane
// tailwind component extractor
// tailwind visualizer

// component pane
// unit test integration

// routes tree: generates component AST of all routes for visualizing, searching, and overlaying with live data
    // it's easier to see the real structure of the app, and ask where things are used

// developer story: organize files and runtimes via a timeline that lays on top of an image of your app
    // visualize layers of architecture, files in a layer, connections among files
    // e.g., an input-to-output story showing acceptance/unit tests tied to source code && the execution path through the architecture
    // e.g., a site map

// component REPL: link directly to live representations, in a browser or in nodejs
    // i.e., expose "this" of a component on command for manipulation from the (terminal? editor?)