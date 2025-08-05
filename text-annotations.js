// text-annotations.js
// Simple floating text annotation system

class TextAnnotations {
  constructor(containerElement) {
    this.container = containerElement;
    this.annotations = [];
    this.nextId = 1;
    this.isEditingAnnotation = false;
    
    this.init();
  }
  
  init() {
    // Create annotations container
    this.annotationsContainer = document.createElement('div');
    this.annotationsContainer.id = 'text-annotations-container';
    this.annotationsContainer.style.position = 'absolute';
    this.annotationsContainer.style.top = '0';
    this.annotationsContainer.style.left = '0';
    this.annotationsContainer.style.width = '100%';
    this.annotationsContainer.style.height = '100%';
    this.annotationsContainer.style.pointerEvents = 'none'; // Allow clicks to pass through to Cytoscape
    this.annotationsContainer.style.zIndex = '10'; // Above Cytoscape but below controls
    
    this.container.appendChild(this.annotationsContainer);
  }
  
  createAnnotation(x, y, text = 'New annotation') {
    const annotation = {
      id: this.nextId++,
      x: x,
      y: y,
      text: text
    };
    
    this.annotations.push(annotation);
    this.renderAnnotation(annotation);
    
    return annotation;
  }
  
  renderAnnotation(annotation) {
    // Create the annotation element
    const element = document.createElement('div');
    element.className = 'text-annotation';
    element.id = `annotation-${annotation.id}`;
    element.style.position = 'absolute';
    element.style.left = `${annotation.x}px`;
    element.style.top = `${annotation.y}px`;
    element.style.background = '#fffacd'; // Light yellow
    element.style.border = '2px dashed #ddd';
    element.style.borderRadius = '4px';
    element.style.padding = '8px';
    element.style.fontStyle = 'italic';
    element.style.fontSize = '14px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.maxWidth = '200px';
    element.style.cursor = 'move';
    element.style.pointerEvents = 'auto'; // This element should receive events
    element.style.wordWrap = 'break-word';
    element.style.whiteSpace = 'pre-wrap'; // Preserve line breaks and spaces
    
    // Set content with line break support
    const displayText = annotation.text.replace(/\n/g, '<br>');
    element.innerHTML = displayText;
    
    // Make it draggable
    this.makeDraggable(element, annotation);
    
    // Add double-click to edit
    element.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.editAnnotation(annotation);
    });
    
    // Add right-click context menu
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e, annotation);
    });
    
    this.annotationsContainer.appendChild(element);
  }
  
  makeDraggable(element, annotation) {
    let isDragging = false;
    let dragStartX, dragStartY;
    
    element.addEventListener('mousedown', (e) => {
      if (this.isEditingAnnotation) return;
      
      isDragging = true;
      dragStartX = e.clientX - annotation.x;
      dragStartY = e.clientY - annotation.y;
      
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging && !this.isEditingAnnotation) {
        annotation.x = e.clientX - dragStartX;
        annotation.y = e.clientY - dragStartY;
        
        element.style.left = `${annotation.x}px`;
        element.style.top = `${annotation.y}px`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
  
  editAnnotation(annotation) {
    this.isEditingAnnotation = true;
    
    const element = document.getElementById(`annotation-${annotation.id}`);
    const originalText = annotation.text;
    
    // Create textarea instead of input for better text handling
    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.style.width = '100%';
    textarea.style.border = 'none';
    textarea.style.background = 'transparent';
    textarea.style.fontStyle = 'italic';
    textarea.style.fontSize = '14px';
    textarea.style.fontFamily = 'Arial, sans-serif';
    textarea.style.outline = 'none'; // Remove focus outline
    textarea.style.color = 'inherit'; // Inherit text color
    textarea.style.padding = '0'; // Remove default padding
    textarea.style.margin = '0'; // Remove default margin
    textarea.style.resize = 'none'; // Prevent manual resizing
    textarea.style.overflow = 'hidden'; // Hide scrollbars
    textarea.style.minHeight = '20px'; // Minimum height
    textarea.style.wordWrap = 'break-word';
    
    // Auto-resize function
    const autoResize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      // Also adjust the container if needed
      element.style.height = 'auto';
    };
    
    // Replace text with textarea
    element.innerHTML = '';
    element.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    // Auto-resize on input
    textarea.addEventListener('input', autoResize);
    
    // Initial resize
    autoResize();
    
    const finishEdit = () => {
      this.isEditingAnnotation = false;
      
      const newText = textarea.value.trim();
      if (newText) {
        annotation.text = newText;
        // For display, convert line breaks to HTML breaks for better formatting
        const displayText = newText.replace(/\n/g, '<br>');
        element.innerHTML = displayText;
        // Reset container height to auto
        element.style.height = 'auto';
      } else {
        // If empty, remove annotation
        this.removeAnnotation(annotation.id);
      }
    };
    
    textarea.addEventListener('blur', finishEdit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finishEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.isEditingAnnotation = false;
        annotation.text = originalText;
        // Restore original text with line breaks
        const displayText = originalText.replace(/\n/g, '<br>');
        element.innerHTML = displayText;
        element.style.height = 'auto';
      }
      // Shift+Enter allows line breaks - no special handling needed
    });
  }
  
  showContextMenu(event, annotation) {
    // Remove any existing context menu
    const existingMenu = document.getElementById('annotation-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.id = 'annotation-context-menu';
    menu.style.position = 'absolute';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.background = 'white';
    menu.style.border = '1px solid #ccc';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.zIndex = '1000';
    menu.style.minWidth = '120px';
    
    const editOption = document.createElement('div');
    editOption.textContent = 'Edit';
    editOption.style.padding = '8px 12px';
    editOption.style.cursor = 'pointer';
    editOption.style.borderBottom = '1px solid #eee';
    editOption.addEventListener('click', () => {
      menu.remove();
      this.editAnnotation(annotation);
    });
    
    const deleteOption = document.createElement('div');
    deleteOption.textContent = 'Delete';
    deleteOption.style.padding = '8px 12px';
    deleteOption.style.cursor = 'pointer';
    deleteOption.style.color = '#d44';
    deleteOption.addEventListener('click', () => {
      menu.remove();
      this.removeAnnotation(annotation.id);
    });
    
    editOption.addEventListener('mouseenter', () => editOption.style.background = '#f5f5f5');
    editOption.addEventListener('mouseleave', () => editOption.style.background = 'transparent');
    deleteOption.addEventListener('mouseenter', () => deleteOption.style.background = '#f5f5f5');
    deleteOption.addEventListener('mouseleave', () => deleteOption.style.background = 'transparent');
    
    menu.appendChild(editOption);
    menu.appendChild(deleteOption);
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    const removeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 10);
  }
  
  removeAnnotation(id) {
    this.annotations = this.annotations.filter(a => a.id !== id);
    const element = document.getElementById(`annotation-${id}`);
    if (element) {
      element.remove();
    }
  }
  
  // Export/import for save/load functionality
  exportAnnotations() {
    return this.annotations.map(a => ({
      id: a.id,
      x: a.x,
      y: a.y,
      text: a.text
    }));
  }
  
  importAnnotations(annotationsData) {
    this.clearAllAnnotations();
    
    if (annotationsData && Array.isArray(annotationsData)) {
      annotationsData.forEach(data => {
        const annotation = {
          id: data.id || this.nextId++,
          x: data.x || 100,
          y: data.y || 100,
          text: data.text || 'Annotation'
        };
        
        this.annotations.push(annotation);
        this.renderAnnotation(annotation);
        
        // Update nextId to avoid conflicts
        if (annotation.id >= this.nextId) {
          this.nextId = annotation.id + 1;
        }
      });
    }
  }
  
  clearAllAnnotations() {
    this.annotations = [];
    this.annotationsContainer.innerHTML = '';
  }
}

// Export for use in other modules
export { TextAnnotations };
