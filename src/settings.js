document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('settings-form');
    const apiTypeSelect = document.getElementById('api-type');
    const anthropicFields = document.getElementById('anthropic-fields');
    const awsFields = document.getElementById('aws-fields');
    const anthropicModelSelect = document.getElementById('anthropic-model');
    const awsModelSelect = document.getElementById('aws-model');

    // Load saved settings
    chrome.storage.sync.get(['apiType', 'anthropicApiKey', 'awsAccessKeyId', 'awsSecretAccessKey', 'anthropicModel', 'awsModel'], function(result) {
        if (result.apiType) {
            apiTypeSelect.value = result.apiType;
            toggleApiFields(result.apiType);
        }
        if (result.anthropicApiKey) {
            document.getElementById('anthropic-api-key').value = result.anthropicApiKey;
        }
        if (result.awsAccessKeyId) {
            document.getElementById('aws-access-key-id').value = result.awsAccessKeyId;
        }
        if (result.awsSecretAccessKey) {
            document.getElementById('aws-secret-access-key').value = result.awsSecretAccessKey;
        }
        if (result.anthropicModel) {
            anthropicModelSelect.value = result.anthropicModel;
        }
        if (result.awsModel) {
            awsModelSelect.value = result.awsModel;
        }
    });

    apiTypeSelect.addEventListener('change', function() {
        toggleApiFields(this.value);
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        const apiType = apiTypeSelect.value;
        const settings = { apiType };

        if (apiType === 'anthropic') {
            settings.anthropicApiKey = document.getElementById('anthropic-api-key').value;
            settings.anthropicModel = anthropicModelSelect.value;
        } else if (apiType === 'aws-bedrock') {
            settings.awsAccessKeyId = document.getElementById('aws-access-key-id').value;
            settings.awsSecretAccessKey = document.getElementById('aws-secret-access-key').value;
            settings.awsModel = awsModelSelect.value;
        }

        chrome.storage.sync.set(settings, function() {
            alert('Settings saved successfully!');
        });
    });

    function toggleApiFields(apiType) {
        if (apiType === 'anthropic') {
            anthropicFields.classList.remove('hidden');
            awsFields.classList.add('hidden');
        } else if (apiType === 'aws-bedrock') {
            anthropicFields.classList.add('hidden');
            awsFields.classList.remove('hidden');
        }
    }
});
