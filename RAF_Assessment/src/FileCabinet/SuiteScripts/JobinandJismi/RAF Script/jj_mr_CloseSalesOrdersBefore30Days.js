/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/email', 'N/file', 'N/record', 'N/search', 'N/runtime'],
    /**
 * @param{email} email
 * @param{file} file
 * @param{record} record
 * @param{search} search
 */
    (email, file, record, search, runtime) => {
        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */
        let csvContent = 'Internal Id, Document Number, Customer Name, Total Amount\n';

        const getInputData = (inputContext) => {
            try{
                // let today = new Date()
                // let date = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                // date.setDate(date.getDate() - 30);
                // log.debug('Date', date);
                
                return search.create({
                    type: search.Type.SALES_ORDER,
                    filters: [
                        ['status', 'anyof', 'SalesOrd:B'],
                        'AND',
                        ['mainline', 'is', 'T'],
                        'AND',
                        ['trandate', 'onorbefore', 'thirtydaysago']
                    ],
                    columns: ['internalid', 'tranid', 'entity', 'total']
                });

            }
            catch(e){
                log.debug('Error@GetInputdata', e.message);
            }
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        // const map = (mapContext) => {
        // }

        /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */
        const reduce = (reduceContext) => {
            try{
                let data = JSON.parse(reduceContext.values);
                let internalId = data.id;
                let documentNumber = data.values.tranid;
                let customerId = data.values.entity;
                let totalAmount = data.values.total;
                csvContent += internalId + ',' + documentNumber + ',' + customerId.text + ',' + totalAmount + '\n';
                let salesOrder = record.load({
                    type: record.Type.SALES_ORDER,
                    id: internalId
                });
                let lineCount = salesOrder.getLineCount({
                    sublistId: 'item'
                });
                for(let i = 0; i < lineCount; i++){
                    // salesOrder.selectLine({sublistId: 'item', line: i});
                    let isClosed = salesOrder.setSublistValue({sublistId:'item', fieldId:'isclosed', line: i, value: true});
                    // salesOrder.commitLine({sublistId: 'item'});
                }
                let save = salesOrder.save();
                reduceContext.write({
                    value: csvContent
                });
            }
            catch(e){
                log.debug('Error@reduce', e.stack + e.message);
            }
        }

        /**
         * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
         * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
         * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
         * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
         *     script
         * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
         * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
         * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
         * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
         *     script
         * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
         * @param {Object} summaryContext.inputSummary - Statistics about the input stage
         * @param {Object} summaryContext.mapSummary - Statistics about the map stage
         * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
         * @since 2015.2
         */

        const summarize = (summaryContext) => {
            try{
                // log.debug('CSV Content', csvContent);
                let closed;
                summaryContext.output.iterator().each(function(value){
                    closed = JSON.parse(value)
                    return true;
                });
                let csvContent = 'Document Number,Internal ID,Customer Name,Total Amount\n';
                csvContent += closed.value;

                let fileObj = file.create({
                    name: 'Closed Sales Orders List.csv',
                    fileType: file.Type.CSV,
                    contents: csvContent,
                    folder: -15
                });
                let fileId = fileObj.save();
                if(fileId){
                    log.debug('CSV Status', 'CSV file has been created and saved to the File Cabinet.');
                }
                email.send({
                    author: -5,
                    recipients: -5,
                    subject: 'Sales Orders Closed',
                    body: 'Hi Administrator, \n This email is to inform you that sales orders with a status of "Pending Fulfillment" and that havethe Transaction Date on or before 30 days ago, have been close by a Map/Reduce script. The details of closed Sales Orders have been mentioned int the attached CSV file. Review and do the needful. \n\n Thank you.\n',
                    attachments: [file.load({
                        id: fileId
                    })]
                });
            }
            catch(e){
                log.debug('Error @ Summarize', e.stack + e);
            }
        }

        return {getInputData, reduce, summarize}

    });
