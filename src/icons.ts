import { LabIcon } from '@jupyterlab/ui-components';
import graphIconStr from '../style/icons/graph.svg';
import addIconStr from '../style/icons/add.svg';
import caretLeftIconStr from '../style/icons/caret-left.svg';
import caretRightIconStr from '../style/icons/caret-right.svg';
import deleteIconStr from '../style/icons/delete.svg';

export const graphIcon = new LabIcon({
  name: 'exploratory:graph',
  svgstr: graphIconStr
});

export const addIcon = new LabIcon({
  name: 'exploratory:add',
  svgstr: addIconStr
});

export const caretLeftIcon = new LabIcon({
  name: 'exploratory:caret-left',
  svgstr: caretLeftIconStr
});

export const caretRightIcon = new LabIcon({
  name: 'exploratory:caret-right',
  svgstr: caretRightIconStr
});

export const deleteIcon = new LabIcon({
  name: 'exploratory:delete',
  svgstr: deleteIconStr
});
