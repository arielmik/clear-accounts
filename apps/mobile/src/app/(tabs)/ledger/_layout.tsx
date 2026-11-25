import { TabStack } from '../../../components/TabStack';

/**
 * La lista (index) queda siempre en la base de la pila: si se abre un detalle desde
 * otra pestaña (ej. un grupo desde Inicio), "atrás" y tocar la pestaña llevan a la lista.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default TabStack;
