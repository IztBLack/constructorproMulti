import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

type TableProps = HTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
};

/** Envoltura con scroll horizontal y borde redondeado, lista para una <table> dentro. */
export function TableContainer({ children, className = '', ...rest }: TableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-neutral-200 bg-white ${className}`}>
      <table className="w-full text-sm" {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-neutral-200 text-left text-neutral-500">{children}</tr>
    </thead>
  );
}

export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 font-medium ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-neutral-600 ${className}`} {...rest}>
      {children}
    </td>
  );
}
