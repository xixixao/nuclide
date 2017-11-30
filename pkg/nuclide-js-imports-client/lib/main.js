/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {CodeActionConfig} from '../../nuclide-language-service/lib/CodeActionProvider';
import type {ServerConnection} from '../../nuclide-remote-connection';
import type {AtomLanguageServiceConfig} from '../../nuclide-language-service/lib/AtomLanguageService';
import type {LanguageService} from '../../nuclide-language-service/lib/LanguageService';

import typeof * as JsService from '../../nuclide-js-imports-client-rpc/lib/JsImportsService';

import {applyTextEditsToBuffer} from 'nuclide-commons-atom/text-edit';
import {
  AtomLanguageService,
  getHostServices,
} from '../../nuclide-language-service';
import {NullLanguageService} from '../../nuclide-language-service-rpc';
import {
  getNotifierByConnection,
  getFileVersionOfEditor,
} from '../../nuclide-open-files';
import {getServiceByConnection} from '../../nuclide-remote-connection';
import featureConfig from 'nuclide-commons-atom/feature-config';

const JS_IMPORTS_SERVICE_NAME = 'JSAutoImportsService';

export function activate() {
  const jsImportLanguageServiceCreate = createLanguageService();
  jsImportLanguageServiceCreate.then(value => value.activate());
  atom.commands.add(
    'atom-text-editor',
    'nuclide-js-imports:auto-require',
    async () => {
      const jsImportLanguageService = await (jsImportLanguageServiceCreate: any);
      const editor = atom.workspace.getActiveTextEditor();
      if (editor == null) {
        return;
      }
      const fileVersion = await getFileVersionOfEditor(editor);
      const range = editor.getBuffer().getRange();
      const languageService = await jsImportLanguageService.getLanguageServiceForUri(
        editor.getPath(),
      );
      const result = await languageService.formatSource(fileVersion, range, {
        fixImports: true,
      });
      console.log(result);
      if (result != null) {
        if (!applyTextEditsToBuffer(editor.getBuffer(), result)) {
          throw new Error('Could not apply edits to text buffer.');
        }
      }
    },
  );
}

async function connectToJSImportsService(
  connection: ?ServerConnection,
): Promise<LanguageService> {
  const jsService: JsService = getServiceByConnection(
    JS_IMPORTS_SERVICE_NAME,
    connection,
  );

  const [fileNotifier, host] = await Promise.all([
    getNotifierByConnection(connection),
    getHostServices(),
  ]);

  const lspService = await jsService.initializeLsp(
    ['.flowconfig'],
    ['.js'],
    (featureConfig.get('nuclide-js-imports-client.logLevel'): any),
    fileNotifier,
    host,
    getAutoImportSettings(),
  );
  return lspService || new NullLanguageService();
}

async function createLanguageService(): Promise<
  AtomLanguageService<LanguageService>,
> {
  const diagnosticsConfig = {
    version: '0.2.0',
    analyticsEventName: 'jsimports.observe-diagnostics',
  };

  const autocompleteConfig = {
    version: '2.0.0',
    inclusionPriority: 1,
    suggestionPriority: 3,
    excludeLowerPriority: false,
    analyticsEventName: 'jsimports.getAutocompleteSuggestions',
    disableForSelector: null,
    autocompleteCacherConfig: null,
    onDidInsertSuggestionAnalyticsEventName: 'jsimports.autocomplete-chosen',
  };

  const codeActionConfig: CodeActionConfig = {
    version: '0.1.0',
    priority: 0,
    analyticsEventName: 'jsimports.codeAction',
    applyAnalyticsEventName: 'jsimports.applyCodeAction',
  };

  const atomConfig: AtomLanguageServiceConfig = {
    name: 'JSAutoImports',
    grammars: ['source.js.jsx', 'source.js'],
    diagnostics: diagnosticsConfig,
    autocomplete: autocompleteConfig,
    codeAction: codeActionConfig,
  };
  return new AtomLanguageService(connectToJSImportsService, atomConfig);
}

function getAutoImportSettings() {
  // Currently, we will get the settings when the package is initialized. This
  // means that the user would need to restart Nuclide for a change in their
  // settings to take effect. In the future, we would most likely want to observe
  // their settings and send DidChangeConfiguration requests to the server.
  // TODO: Observe settings changes + send to the server.
  return {
    diagnosticsWhitelist: featureConfig.get(
      'nuclide-js-imports-client.diagnosticsWhitelist',
    ),
    requiresWhitelist: featureConfig.get(
      'nuclide-js-imports-client.requiresWhitelist',
    ),
  };
}
