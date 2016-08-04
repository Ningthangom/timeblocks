var TimeBlocks = (function () {
  var moment = vis.moment;
  var util = vis.util;
  var DataSet = vis.DataSet;
  var DataView = vis.DataSet;
  var Range = vis.timeline.Range;
  var Core = vis.timeline.Core;
  var TimeAxis = vis.timeline.components.TimeAxis;
  var CurrentTime = vis.timeline.components.CurrentTime;
  var CustomTime = vis.timeline.components.CustomTime;
  var Timeline = vis.Timeline;
  var DateUtil = vis.timeline.DateUtil;


  /************************    DefaultDataScale    ****************************/

  /**
   * Data scale
   * @param {number} start              Start value of the scale
   * @param {number} end                End value of the scale
   * @param {number} containerHeight    Height of the TimeBlocks component in pixels
   * @param {{margin: number?, format: function?, isMajor: function?}} [options]
   * @constructor
   */
  function DataScale (start, end, containerHeight, options) {
    this.start = start || 0;
    this.end = end || 0;
    this.containerHeight = containerHeight;

    this.margin = options && typeof options.margin === 'number' ? options.margin: 16;
    var range = this.end - this.start;
    this.scale = (this.containerHeight - 2 * this.margin) / range;
    this.step = 1;
    this.format = options && typeof options.format === 'function'
        ? options.format
        : format;
    this.isMajor = options && typeof options.isMajor === 'function'
        ? options.isMajor
        : function isMajor (value) {
      return value % 10 === 0
    }
  }

  DataScale.prototype.screenToValue = function (pixels) {
    return ((pixels - this.margin) / this.scale) + this.start;
  };

  DataScale.prototype.valueToScreen = function (value) {
    return (value - this.start) * this.scale + this.margin;
  };

  /**
   * Returns an array with all labels
   * @returns {Array.<{value: number, y: number, text: string, isMajor: boolean}>}
   */
  DataScale.prototype.getLabels = function () {
    var labels = [];
    var max = 1000;
    var count = 0;
    var value = this.start;

    if (this.end > this.start) {
      while (value <= this.end && count < max) {
        labels.push({
          value: value,
          y: this.valueToScreen(value),
          text: this.format(value),
          isMajor: this.isMajor(value)
        });

        value += this.step;
        count++;
      }
    }

    return labels;
  };

  /*****************************    TimeBlocks    *******************************/


  /**
   * Create a TimeBlocks visualization
   * @param {HTMLElement} container
   * @param {vis.DataSet | Array} [items]
   * @param {vis.DataSet | Array} [labels]
   * @param {Object} [options]  See TimeBlocks.setOptions for the available options.
   * @constructor
   * @extends Core
   */
  function TimeBlocks (container, items, labels, options) {
    // if the third element is options, the forth is groups (optionally);
    if (!(Array.isArray(labels) || labels instanceof DataSet || labels instanceof DataView) && labels instanceof Object) {
      var forthArgument = options;
      options = labels;
      labels = forthArgument;
    }

    var me = this;
    this.defaultOptions = {
      start: null,
      end:   null,

      autoResize: true,

      orientation: {
        axis: 'bottom',   // axis orientation: 'bottom', 'top', or 'both'
        item: 'bottom'    // not relevant for TimeBlocks
      },

      moment: moment,

      width: null,
      height: null,
      maxHeight: null,
      minHeight: null,

      yMin: null,
      yMax: null
    };
    this.options = util.deepExtend({}, this.defaultOptions);

    // Create the DOM, props, and emitter
    this._create(container);

    // all components listed here will be repainted automatically
    this.components = [];

    this.body = {
      dom: this.dom,
      domProps: this.props,
      emitter: {
        on: this.on.bind(this),
        off: this.off.bind(this),
        emit: this.emit.bind(this)
      },
      hiddenDates: [],
      util: {
        toScreen: me._toScreen.bind(me),
        toGlobalScreen: me._toGlobalScreen.bind(me), // this refers to the root.width
        toTime: me._toTime.bind(me),
        toGlobalTime : me._toGlobalTime.bind(me)
      }
    };

    // range
    this.range = new Range(this.body);
    this.components.push(this.range);
    this.body.range = this.range;

    // time axis
    this.timeAxis = new TimeAxis(this.body);
    this.components.push(this.timeAxis);

    // current time bar
    this.currentTime = new CurrentTime(this.body);
    this.components.push(this.currentTime);

    // // item set
    this.blockGraph = new TimeBlocks.BlockGraph(this.body, options || {});
    this.components.push(this.blockGraph);

    this.itemsData = null;      // DataSet
    this.labelsData = null;     // DataSet


    this.on('tap', function (event) {
      me.emit('click', me.getEventProperties(event))
    });
    // TODO: implement select
    this.on('doubletap', function (event) {
      me.emit('doubleClick', me.getEventProperties(event))
    });
    this.dom.root.oncontextmenu = function (event) {
      me.emit('contextmenu', me.getEventProperties(event))
    };

    this.on('requestRedraw', function () {
      me._redraw();
    });

    var _timelineRedraw = this._redraw.bind(this);
    this._redraw = function () {
      me.emit('beforeRedraw');
      var res = _timelineRedraw();
      me.emit('afterRedraw');
      return res;
    };

    // apply options
    if (options) {
      this.setOptions(options);
    }

    // create labels
    if (labels) {
      this.setLabels(labels);
    }

    // create itemset
    if (items) {
      this.setItems(items);
    }

    // draw for the first time
    this._redraw();
  }

// Extend the functionality from Core
  TimeBlocks.prototype = new Core();

  TimeBlocks.prototype.setOptions = function (options) {
    // TODO: validate options

    var yScale = this.blockGraph.options.yScale;
    var yScaleChanged = typeof options.yScale !== 'undefined' && yScale !== options.yScale;
    var scrollTop = this.props.scrollTop;
    var height = this.body.domProps.centerContainer.height;
    var middle = this.blockGraph.scale.screenToValue(height / 2 - scrollTop);

    Core.prototype.setOptions.call(this, options);

    if (yScaleChanged) {
      // prevent screen from jumping vertically to some new position
      // by adjusting the scrollTop and scrollTopMin
      var yScreen = this.blockGraph.scale.valueToScreen(middle);
      var windowHeight = this.body.domProps.centerContainer.height;
      var newScrollTop = windowHeight / 2 - yScreen;

      var diff = (options.yScale / yScale - 1) * this.props.center.height;
      this.props.scrollTop = newScrollTop;
      this.props.scrollTopMin -= diff;

      this._redraw();
    }
  };

  /**
   * Set items
   * @param {vis.DataSet | Array | null} items
   */
  TimeBlocks.prototype.setItems = function(items) {
    var initialLoad = (this.itemsData == null);

    // convert to type DataSet when needed
    var newDataSet;
    if (!items) {
      newDataSet = null;
    }
    else if (items instanceof DataSet || items instanceof DataView) {
      newDataSet = items;
    }
    else {
      // turn an array into a DataSet
      newDataSet = new DataSet(items, {
        type: {
          start: 'Date',
          end: 'Date'
        }
      });
    }

    // set items
    this.itemsData = newDataSet;
    this.blockGraph.setItems(this.itemsData);

    if (initialLoad) {
      if (this.options.start != undefined || this.options.end != undefined) {
        var start = this.options.start != undefined ? this.options.start : null;
        var end   = this.options.end != undefined   ? this.options.end : null;
        this.setWindow(start, end, {animation: false});
      }
      else {
        this.fit({animation: false});
      }
    }
    else {
      // TODO: redraw when needed
    }
  };

  /**
   * Set labels displayed on the vertical axis
   * @param {vis.DataSet | Array} labels
   */
  TimeBlocks.prototype.setLabels = function(labels) {
    // convert to type DataSet when needed
    var newDataSet;
    if (!labels) {
      newDataSet = null;
    }
    else if (labels instanceof DataSet || labels instanceof DataView) {
      newDataSet = labels;
    }
    else {
      // turn an array into a dataset
      newDataSet = new DataSet(labels);
    }

    this.labelsData = newDataSet;
    this.blockGraph.setLabels(this.labelsData);

    // TODO: redraw when needed
  };

  /**
   * Calculate the data range of the items start and end dates
   * @returns {{min: Date | null, max: Date | null}}
   */
  TimeBlocks.prototype.getDataRange = Timeline.prototype.getDataRange;


  /**
   * Generate Timeline related information from an event
   * @param {Event} event
   * @return {Object} An object with related information, like on which area
   *                  The event happened, whether clicked on an item, etc.
   */
  TimeBlocks.prototype.getEventProperties = function (event) {
    var clientX = event.center ? event.center.x : event.clientX;
    var clientY = event.center ? event.center.y : event.clientY;
    if (this.options.rtl) {
      var x = util.getAbsoluteRight(this.dom.centerContainer) - clientX;
    } else {
      var x = clientX - util.getAbsoluteLeft(this.dom.centerContainer);
    }
    var y = clientY - util.getAbsoluteTop(this.dom.centerContainer);
    var time = this._toTime(x);
    var yValue = this.blockGraph.scale.screenToValue(y);

    var item  = this.blockGraph.itemFromTarget(event);
    var label = this.blockGraph.labelFromTarget(event);
    var customTime = CustomTime.customTimeFromTarget(event);

    var element = util.getTarget(event);
    var what = null;
    if (item != null)                                                    {what = 'item';}
    else if (label != null)                                              {what = 'label';}
    else if (customTime != null)                                         {what = 'custom-time';}
    else if (util.hasParent(element, this.timeAxis.dom.foreground))      {what = 'axis';}
    else if (this.timeAxis2 && util.hasParent(element, this.timeAxis2.dom.foreground)) {what = 'axis';}
    else if (util.hasParent(element, this.currentTime.bar))              {what = 'current-time';}
    else if (util.hasParent(element, this.dom.center))                   {what = 'background';}

    return {
      event: event,
      item: item ? item[this.itemsData._fieldId] : null,
      label: label ? label[this.labelsData._fieldId] : null,
      what: what,
      pageX: event.srcEvent ? event.srcEvent.pageX : event.pageX,
      pageY: event.srcEvent ? event.srcEvent.pageY : event.pageY,
      x: x,
      y: y,
      time: time,
      yValue: yValue
    }
  };


  /**
   * Adjust the visible window such that the selected item is centered on screen.
   * @param {String | number} id     An item id
   * @param {Boolean} [vertical] Whether to focus vertically
   * @param {Boolean} [horizontal] Whether to focus horizontally
   */
  TimeBlocks.prototype.focus = function(id, vertical, horizontal) {
    if (!this.itemsData || id == undefined) return;
    if (vertical == undefined) vertical = true;
    if (horizontal == undefined) horizontal = true;

    // get the specified item(s)
    var itemData = this.itemsData.getDataSet().get(id, {
      type: {
        start: 'Date',
        end: 'Date'
      }
    });

    if(itemData !== null) {
      if (vertical) {
        // calculate vertical position for the scroll top
        var yAvg = (itemData.yMin + itemData.yMax) / 2;
        var yScreen = this.blockGraph.scale.valueToScreen(yAvg);
        var windowHeight = this.body.domProps.centerContainer.height;
        var scrollTop = yScreen - windowHeight / 2;
        this._setScrollTop(-scrollTop);
      }
      if (horizontal) {
        // calculate minimum start and maximum end of specified items
        var start = itemData.start.valueOf();
        var end = itemData.end.valueOf();

        if (start !== null && end !== null) {
          // calculate the new middle and interval for the window
          var middle = (start + end) / 2;
          var interval = Math.max((this.range.end - this.range.start), (end - start) * 1.1);

          var animation = false;
          this.range.setRange(middle - interval / 2, middle + interval / 2, animation);
        }
      }
    }
  };

  /**
   * Adjust the visible window such that the selected item is centered vertically on the screen
   * @param {String} id   An item id
   */
  TimeBlocks.prototype.focusVertically = function(id) {
    this.focus(id, true, false)
  };

  /**
   * Move vertically, center a specific value
   * @param {number} y
   */
  TimeBlocks.prototype.moveToVertically = function (y) {
    var yScreen = this.blockGraph.scale.valueToScreen(y);
    var windowHeight = this.body.domProps.centerContainer.height;
    var scrollTop = yScreen - windowHeight / 2;
    this._setScrollTop(-scrollTop);
    this._redraw();
  };

  /**
   * Get the vertical visible window
   * @returns {{yMin: number, yMax: number}}
   */
  TimeBlocks.prototype.getWindowVertically = function () {
    var scrollTop = this.props.scrollTop;
    var height = this.body.domProps.centerContainer.height;

    return {
      yMin: this.blockGraph.scale.screenToValue(-scrollTop),
      yMax: this.blockGraph.scale.screenToValue(height - scrollTop)
    }
  };

  /*****************************    BlockGraph    *******************************/


  function BlockGraph (body, options) {
    this.body = body;

    this.defaultOptions = {
      yMin: null,
      yMax: null
    };

    this.options = util.extend({}, this.defaultOptions);

    this.dom = {
      values: [],
      grid: [],
      items: [],
      labels: []
    };

    this.props = {
      width: 0,
      valueWidth: 0,
      labelsWidth: null,
      charHeight: 24,
      yMin: null,
      yMax: null
    };

    this.scale = new TimeBlocks.DataScale(0, 0, 0);

    // the _update method is called when anything in the DataSets changes
    var me = this;
    this._update = function () {
      me._updateMinMax();
      me.body.emitter.emit('requestRedraw');
    };

    this.itemsData = null;
    this.labelsData = null;

    this._create();
    this.setOptions(options);
  }

  BlockGraph.prototype.setOptions = function (options) {
    var fields = ['yMin', 'yMax', 'yScale', 'onRenderItem', 'onRenderLabel'];
    util.selectiveExtend(fields, this.options, options);

    this._updateMinMax();
  };

  BlockGraph.prototype._updateMinMax = function () {
    if (this.options.yMin != null) {
      this.props.yMin = this.options.yMin
    }
    else {
      var minItem = this.itemsData && this.itemsData.min('yMin');
      if (minItem) {
        this.props.yMin = minItem.yMin;
      }

      var minLabel = this.labelsData && this.labelsData.min('yMin');
      if (minLabel) {
        this.props.yMin = this.props.yMin == null
            ? minLabel.yMin
            : Math.min(this.props.yMin, minLabel.yMin)
      }
    }

    if (this.options.yMax != null) {
      this.props.yMax = this.options.yMax
    }
    else {
      var maxItem = this.itemsData && this.itemsData.max('yMax');
      if (maxItem) {
        this.props.yMax = maxItem.yMax;
      }

      var maxLabel = this.labelsData && this.labelsData.max('yMax');
      if (maxLabel) {
        this.props.yMax = this.props.yMax == null
            ? maxLabel.yMax
            : Math.max(this.props.yMax, maxLabel.yMax)
      }
    }
  };

  BlockGraph.prototype._create = function () {
    this.dom.verticalAxis = document.createElement('div');
    this.dom.verticalAxis.className = 'timeblocks-vertical-axis';

    this.dom.itemsContainer = document.createElement('div');
    this.dom.itemsContainer.className = 'timeblocks-items';

    this.dom.labelsContainer = document.createElement('div');
    this.dom.labelsContainer.className = 'timeblocks-labels';
  };

  BlockGraph.prototype.redraw = function () {
    if (this.options.yScale) {
      const yDiff = this.props.yMax - this.props.yMin;
      this.props.height = yDiff * this.options.yScale;
    }
    else {
      // fit the surrounding box
      this.props.height = this.body.domProps.centerContainer.height;
    }

    this.scale = new TimeBlocks.DataScale(this.props.yMin, this.props.yMax, this.props.height, {
      isMajor: function (value) {
        return value % 5 === 0
      }
    });

    this.dom.itemsContainer.style.height = this.props.height + 'px';
    this.dom.labelsContainer.style.height = this.props.height + 'px';

    var axisResized = this._redrawAxis();

    var itemsResized = this._redrawItems();

    return axisResized || itemsResized;
  };

  BlockGraph.prototype._redrawAxis = function () {
    var resized = false;
    var charHeight = this.props.charHeight;
    var gridWidth = 20; // TODO: make customizable
    var props = this.props;
    var dom = this.dom;

    var labels = this.scale.getLabels();

    // attach to DOM
    if (!this.dom.verticalAxis.parentNode) {
      this.body.dom.left.appendChild(this.dom.verticalAxis)
    }
    if (!this.dom.labelsContainer.parentNode) {
      this.dom.verticalAxis.appendChild(this.dom.labelsContainer)
    }

    // remove all old values
    // TODO: reuse DOM elements
    this._removeDomElements(this.dom.values);
    this._removeDomElements(this.dom.grid);
    this._removeDomElements(this.dom.labels);

    labels.forEach(function (label) {
      var grid = document.createElement('div');
      grid.className = 'timeblocks-grid-line ' + (label.isMajor ? 'vis-major' : 'vis-minor');
      grid.style.top = label.y + 'px';
      grid.style.right = props.valueWidth + 'px';
      grid.style.width = (label.isMajor ? gridWidth : gridWidth / 2) + 'px';
      grid.style.position = 'absolute';

      dom.verticalAxis.appendChild(grid);
      dom.grid.push(grid);

      if (label.isMajor) {
        var value = document.createElement('div');
        value.className = 'timeblocks-grid-value ' + (label.isMajor ? 'vis-major' : 'vis-minor');
        value.appendChild(document.createTextNode(label.text));
        value.style.top = (label.y - charHeight / 2 + 1) + 'px';
        value.style.right = '0';
        value.style.position = 'absolute';
        value.style.boxSizing = 'border-box';

        dom.verticalAxis.appendChild(value);
        dom.values.push(value);
      }
    });

    if (this.labelsData) {
      var scale = this.scale;
      var contentToHTML = this._contentToHTML;
      var onRenderLabel = this.options.onRenderLabel;

      this.labelsData.forEach(function (data) {
        var yMin = scale.valueToScreen(data.yMin);
        var yMax = scale.valueToScreen(data.yMax);

        var contents = document.createElement('div');
        contents.className = 'timeblocks-label-contents';
        contents.appendChild(contentToHTML(data.content));

        var label = document.createElement('div');
        label.className = 'timeblocks-label' + (data.className ? (' ' + data.className) : '');
        label.appendChild(contents);
        label.title = data.title || '';

        label.style.top = yMin + 'px';
        label.style.height = (yMax - yMin) + 'px';
        label.style.position = 'absolute';
        label.style.boxSizing = 'border-box';

        label['timeblocks-label'] = data;

        if (onRenderLabel) {
          label = onRenderLabel(label, data);
        }

        dom.labelsContainer.appendChild(label);
        dom.labels.push(label);
      })
    }

    // determine the width of the labels
    var labelsWidth = this.props.labelsWidth;
    if (labelsWidth === null) {
      labelsWidth = this.dom.labelsContainer.clientWidth;
      this.props.labelsWidth = labelsWidth;
    }

    // determine the width of the axis (after we've appended all childs)
    var valueWidth = 0;
    dom.values.forEach(function (value) {
      if (value.offsetWidth > valueWidth) {
        valueWidth = value.offsetWidth;
      }
    });
    this.props.valueWidth = valueWidth;

    // var gridWidth = dom.grid[0] && dom.grid[0].clientWidth || 0;
    var width = valueWidth + gridWidth + labelsWidth;
    resized = resized || (this.props.width !== width);
    this.props.width = width;

    // calculate char size
    this.props.charHeight = dom.values[0] && dom.values[0].clientHeight || 24;

    // apply width
    this.dom.verticalAxis.style.width = width + 'px';

    return resized;
  };


  BlockGraph.prototype._redrawItems = function () {
    // attach to DOM
    if (!this.dom.itemsContainer.parentNode) {
      this.body.dom.center.appendChild(this.dom.itemsContainer)
    }

    // we're going to reuse existing items
    var redundantItems = this.dom.items;
    this.dom.items = [];

    if (this.itemsData) {
      var itemsData = this.itemsData;
      var height = this.props.height;
      var toScreen = this.body.util.toScreen;
      var scale = this.scale;
      var dom = this.dom;
      var contentToHTML = this._contentToHTML;
      var onRenderItem = this.options.onRenderItem;
      var contentToString = this._contentToString;

      // TODO: filter on visible items and render only these
      this.itemsData.forEach(function (data) {
        // TODO: create a class ItemBlock, move all item logic there
        var id = data[itemsData._fieldId];
        var start = toScreen(util.convert(data.start, 'Date'));
        var end = toScreen(util.convert(data.end, 'Date'));
        var yMin = scale.valueToScreen(data.yMin);
        var yMax = scale.valueToScreen(data.yMax);

        // reuse existing DOM,
        var item = redundantItems.shift() || document.createElement('div');
        item.className = 'timeblocks-item' + (data.className ? (' ' + data.className) : '');
        item.title = data.title || '';

        item.style.left = start + 'px';
        item.style.width = (end - start) + 'px';
        item.style.top = yMin + 'px';
        item.style.height = (yMax - yMin) + 'px';
        item.style.lineHeight = item.style.height; // for vertically aligning contents to the middle
        item.style.position = 'absolute';
        item.style.boxSizing = 'border-box';

        if (item.firstChild) {
          // reuse existing item, update contents only when changed
          var element = item.firstChild;

          var changed = contentToString(item.content) !== contentToString(data.content);
          if (changed) {
            if (data.content instanceof Element) {
              element.innerHTML = '';
              element.appendChild(data.content);
            }
            else if (data.content != undefined) {
              element.innerHTML = data.content;
            }
            else {
              if (data.content === undefined) {
                throw new Error('Property "content" missing in item ' + id);
              }
            }

            item.content = data.content;
          }
        }
        else {
          // create new contents DOM
          var contents = document.createElement('div');
          contents.className = 'timeblocks-item-contents';
          contents.appendChild(contentToHTML(data.content));
          item.appendChild(contents);
        }

        item['timeblocks-item'] = data;

        if (onRenderItem) {
          item = onRenderItem(item, data);
        }

        if (!item.parentNode) {
          // this is a new item
          dom.itemsContainer.appendChild(item);
        }
        dom.items.push(item);
      });
    }

    this._removeDomElements(redundantItems);

    return false; // size of contents never changes
  };


  /**
   * Stringify the items contents
   * @param {string | Element | undefined} content
   * @returns {string | undefined}
   * @private
   */
  BlockGraph.prototype._contentToString = function (content) {
    if (typeof content === 'string') return content;
    if (content && 'outerHTML' in content) return content.outerHTML;
    return content;
  };


  BlockGraph.prototype.setItems = function (items) {
    var oldItemsData = this.itemsData;

    // replace the dataset
    if (!items) {
      this.itemsData = null;
    }
    else if (items instanceof DataSet || items instanceof DataView) {
      this.itemsData = items;
    }
    else {
      throw new TypeError('Items must be an instance of DataSet or DataView');
    }

    if (oldItemsData) {
      // unsubscribe from old dataset
      oldItemsData.off('*', this._update);
    }

    if (this.itemsData) {
      // subscribe to new dataset
      this.itemsData.on('*', this._update); // listen to the events add, update, remove

      this._updateMinMax();
    }
  };

  BlockGraph.prototype.setLabels = function (labels) {
    var oldLabelsData = this.labelsData;

    // replace the dataset
    if (!labels) {
      this.labelsData = null;
    }
    else if (labels instanceof DataSet || labels instanceof DataView) {
      this.labelsData = labels;
    }
    else {
      throw new TypeError('Labels must be an instance of DataSet or DataView');
    }

    if (oldLabelsData) {
      // unsubscribe from old dataset
      oldLabelsData.off('*', this._update);
    }

    if (this.labelsData) {
      // subscribe to new dataset
      this.labelsData.on('*', this._update); // listen to the events add, update, remove

      this._updateMinMax();
    }
  };

  /**
   * Find an item from an event target:
   * searches for the attribute 'timeblocks-item' in the event target's element tree
   * @param {Event} event
   * @return {Object || null} item    Returns the items data
   */
  BlockGraph.prototype.itemFromTarget = function(event) {
    var target = event.target;
    while (target) {
      if (target.hasOwnProperty('timeblocks-item')) {
        return target['timeblocks-item'];
      }
      target = target.parentNode;
    }

    return null;
  };

  /**
   * Find a label from an event target:
   * searches for the attribute 'timeblocks-label' in the event target's element tree
   * @param {Event} event
   * @return {Object || null} item    Returns the items data
   */
  BlockGraph.prototype.labelFromTarget = function(event) {
    var target = event.target;
    while (target) {
      if (target.hasOwnProperty('timeblocks-label')) {
        return target['timeblocks-label'];
      }
      target = target.parentNode;
    }

    return null;
  };

  /**
   * helper function to remove a list of DOM elements. Array will be emptied
   * @param {Array} array
   * @private
   */
  BlockGraph.prototype._removeDomElements = function (array) {
    while (array.length > 0) {
      var elem = array.pop();
      elem.parentNode.removeChild(elem)
    }
  };

  /**
   * Convert contents to HTML if needed
   * @param {string | Element} content
   * @private
   */
  BlockGraph.prototype._contentToHTML = function (content) {
    if (content instanceof Element) {
      return content;
    }
    else if (content != undefined) {
      return document.createTextNode(content)
    }
    else {
      throw new Error('Property "content" missing');
    }
  };

  /**
   * Format a number. Prevents displaying round off errors
   * @param {number | string} number
   * @return {string} Returns the formatted number
   */
  function format (number) {
    if (typeof number === 'string') {
      return parseFloat(parseFloat(number).toPrecision(12)) + '';
    }
    else { // assume typeof number === 'number'
      return parseFloat(number.toPrecision(12)) + '';
    }
  }

  // export the prototypes we've created, allow overriding/extending
  TimeBlocks.format = format;
  TimeBlocks.BlockGraph = BlockGraph;
  TimeBlocks.DataScale = DataScale;

  return TimeBlocks
})();