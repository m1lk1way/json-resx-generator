const inquirer = require('inquirer');
const program = require('commander');
const DistGenerator = require('./generators/distGenerator');
const SrcGenerator = require('./generators/srcGenerator');
const PathUtility = require('./utils/pathUtility');
const LogUtility = require('./utils/logUtility');
const Markup = require('./utils/markupUtility');

const initModule = ({
    tabSize, srcFolder, distFolder, resxPrefix, jsNamespace, tsGlobInterface, languages, defaultLang, currentLangNS,
}) => {
    /* utilities initialization */
    const pathUtility = new PathUtility();
    pathUtility.init(srcFolder, distFolder, defaultLang, resxPrefix);

    const markupUtility = new Markup();
    markupUtility.init(tabSize);

    const srcGenerator = new SrcGenerator(languages, defaultLang, srcFolder);
    const distGenerator = new DistGenerator(jsNamespace, languages, defaultLang, resxPrefix, srcFolder, currentLangNS, tsGlobInterface);
    /* END */
    
    const generateAll = () => {
        srcGenerator.generateAll()
            .then(() => distGenerator.generateAll())
            .then(() => LogUtility.logSuccess())
            .catch(LogUtility.logErr);
    };

    const yesNo = {
        yes: 'Yes',
        no: 'No',
    };

    const yesNoList = [
        { name: yesNo.yes },
        { name: yesNo.no },
    ];
        
    const askForRecursiveActions = () => {
        inquirer
            .prompt({
                type: 'list',
                name: 'newKey',
                message: 'Would you like to do something else?',
                choices: yesNoList,
            })
            .then(a => {
                if (a.newKey === yesNo.yes) {
                    beginInteraction();
                }
            });
    };

    const beginInteraction = () => {
        const actions = {
            create: 'create',
            add: 'add',
            regenerateAll: 'regenerateAll',
        };

        const actonsList = [
            { name: 'Do everything GOOD', value: actions.regenerateAll },
            { name: 'Create new resx', value: actions.create },
            { name: 'Add keys to existing one', value: actions.add },
        ];

        const startupQuestions = [
            {
                type: 'list', name: 'action', message: 'Select operation?', choices: actonsList,
            },
            {
                type: 'input',
                name: 'resxName',
                message: 'Give it a name: ',
                when: a => a.action === actions.create,
                validate: resxName => {
                    const exists = SrcGenerator.checkChunkExistance(resxName);
                    return exists ? 'Resource file already exists' : true;
                },
            },
        ];

        const defaultSelectedLangs = [defaultLang, 'ru'];
        const langList = languages.map(l => ({ name: l }));

        const doLangKeyValQuestions = (lang, keyName) => ({
            type: 'input',
            name: 'val',
            message: `'${lang}' value for '${keyName}'?`,
            validate: a => (a ? true : 'Can\'t add empty value'),
        });

        const doAddScenarioQuestions = resxName => [
            {
                type: 'input',
                name: 'keyName',
                message: 'Key name? ',
                validate: a => {
                    const fileContent = SrcGenerator.readDefaultLangChunk(resxName);
                    return a in fileContent ? 'This key is already exists' : true;
                },
            },
            {
                type: 'checkbox',
                name: 'keyLangs',
                message: 'Select languages:',
                choices: langList,
                default: defaultSelectedLangs,
                validate: list => {
                    const isDefaultLangSelected = list.includes(defaultLang);
                    return isDefaultLangSelected ? true : `Default language (${defaultLang}) must be selected`;
                },
            },
        ];

        const doAdd = (chunkName, keyName, langValPairs) => {
            SrcGenerator.addKey(chunkName, keyName, langValPairs)
                .then(() => distGenerator.generateChunk(chunkName, 'updated'))
                .then(() => {
                    inquirer
                        .prompt({
                            type: 'list',
                            name: 'newKey',
                            message: 'add one more key?',
                            choices: yesNoList,
                        })
                        .then(a => {
                            switch (a.newKey) {
                                case yesNo.yes:
                                    return addScenario(chunkName);
                                default:
                                    return askForRecursiveActions();
                            }
                        });
                });
        };

        const addScenario = resxName => {
            const askForValues = (keyName, keyLangs) => {
                const langValPairs = [];
                let iteration = 0;
                
                const askForValue = () => {
                    const currLang = keyLangs[iteration];
                    if (langValPairs.length < keyLangs.length) {
                        const question = doLangKeyValQuestions(currLang, keyName);
                        inquirer
                            .prompt(question)
                            .then(a => {
                                langValPairs.push({ [currLang]: a.val });
                                iteration += 1;
                                askForValue();
                            });
                    }
                    else {
                        const langData = langValPairs.reduce((acc, val) => {
                            const key = Object.keys(val)[0];
                            acc[key] = val[key];
                            return acc;
                        }, {});

                        doAdd(resxName, keyName, langData);
                    }
                };

                askForValue();
            };

            const askForKey = () => {
                inquirer
                    .prompt(doAddScenarioQuestions(resxName))
                    .then(a => {
                        askForValues(a.keyName, a.keyLangs);
                    });
            };
            
            askForKey();
        };

        const askForAddKeys = chunkName => {
            inquirer
                .prompt({
                    type: 'list',
                    name: 'addKey',
                    message: 'add keys??',
                    choices: yesNoList,
                })
                .then(a => {
                    switch (a.addKey) {
                        case yesNo.yes:
                            return addScenario(chunkName);
                        default:
                            return askForRecursiveActions();
                    }
                });
        };

        const createScenario = resxName => {
            srcGenerator.generateEmptyChunk(resxName)
                .then(() => distGenerator.generateChunk(resxName, 'created'))
                .then(() => askForAddKeys(resxName));
        };

        const createSelectChunkQuestion = chunkNames => {
            const chunkList = chunkNames.map(chunkName => ({ name: chunkName }));
            return {
                type: 'list',
                name: 'addKey',
                message: 'Select resource: ',
                choices: chunkList,
            };
        };

        const readChunksAndAsk = () => {
            pathUtility.readChunksNames()
                .then(chunkNames => {
                    if (!chunkNames.length) {
                        LogUtility.logErr(`NO RESOURCES FOUND IN ${srcFolder}`);
                        askForRecursiveActions();
                        return;
                    }
                    const question = createSelectChunkQuestion(chunkNames);
                    inquirer
                        .prompt(question)
                        .then(a => {
                            addScenario(a.addKey);
                        });
                })
                .catch(LogUtility.logErr);
        };

        inquirer
            .prompt(startupQuestions)
            .then(a => {
                if (a.action === actions.add) {
                    readChunksAndAsk();
                }
                if (a.action === actions.create) {
                    createScenario(a.resxName);
                }
                if (a.action === actions.regenerateAll) {
                    generateAll();
                }
            });
    };

    program
        .option('-d, --dogood', 'Doing everything GOOD')
        .parse(process.argv);

    if (program.dogood) {
        generateAll();
    }
    else {
        beginInteraction();
    }
};

module.exports = initModule;

// todo: fix interactive mode and move all questions to its own utility;
